#!/usr/bin/env node
/**
 * upload-images-to-oss.mjs
 * 把指定目录下的图片上传到阿里云 OSS（bhgt-public-files, oss-cn-beijing）。
 *
 * 用法:
 *   node upload-images-to-oss.mjs [<图片目录>] [--env <env文件路径>] [--recursive]
 *   省略 <图片目录> 时，默认使用脚本上级的「图片/」目录（自动递归上传子目录）。
 *
 * 规则:
 *   1. 遍历目录下图片；中文名转拼音作为 OSS 对象名（不含中文保持原名）。
 *      目录层级保留，每段各自转拼音，例如 风景/北京/莲池湖.jpg -> fengjing/beijing/lianchihu.jpg。
 *   2. 上传后写同名 .sha1.txt（写到原图同目录）。
 *   3. 线上同名且 SHA1 一致 -> 忽略（不传）。
 *   4. 线上同名但 SHA1 不一致 -> 覆盖上传。
 *   SHA1 同时写入 OSS 对象元数据 x-oss-meta-sha1，供比对。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const OSS = require('ali-oss');
// pinyin-pro 为 ESM 包，用动态 import 加载
const { pinyin } = await import('pinyin-pro');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 配置 ----------
const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.heic', '.avif',
]);
const SHA1_SUFFIX = '.sha1.txt';
const DEFAULT_ENV = path.resolve(__dirname, '../../bhgt-server/.env.test');
// 默认图片目录：相对脚本位置（scripts/ 上级 = 项目根）的「图片/」目录；不写死机器绝对路径
const DEFAULT_IMAGE_DIR = path.resolve(__dirname, '..', '图片');

// ---------- 解析参数 ----------
function parseArgs(argv) {
  const positional = [];
  const opts = { env: null, recursive: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') opts.env = argv[++i];
    else if (a === '--recursive') opts.recursive = true;
    else positional.push(a);
  }
  return { dir: positional[0], opts };
}

// ---------- 环境加载 ----------
function loadEnv(opts) {
  const localEnv = path.resolve(__dirname, '.env');
  if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv });
  const envFile = opts.env || (fs.existsSync(DEFAULT_ENV) ? DEFAULT_ENV : null);
  if (envFile) {
    if (!fs.existsSync(envFile)) {
      console.warn(`[warn] env 文件不存在: ${envFile}`);
    } else {
      dotenv.config({ path: envFile });
    }
  }
}

// ---------- 工具 ----------
function sha1File(p) {
  return createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

const HAS_CJK = /[一-鿿]/;

// 把单个文件名（含扩展名）中的中文转拼音；无中文原样返回
function toOssSegment(seg) {
  const ext = path.extname(seg).toLowerCase();
  const base = path.basename(seg, path.extname(seg));
  if (!HAS_CJK.test(base)) return seg; // 无中文，保持原样（含原扩展名）
  let py = pinyin(base, { toneType: 'none', nonZh: 'consecutive' });
  py = py.toLowerCase().replace(/\s+/g, '');
  py = py.replace(/[^a-z0-9_\-]/g, '');
  if (!py) py = createHash('sha1').update(base).digest('hex').slice(0, 12);
  return py + ext;
}

// 相对路径整体转拼音；保留目录层级（风景/北京/莲池湖.jpg -> fengjing/beijing/lianchihu.jpg）
function toOssName(rel) {
  return rel.split('/').map(toOssSegment).join('/');
}

function walk(dir, recursive) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...walk(full, recursive));
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

// ---------- OSS ----------
let client;

async function getOnlineSha1(ossName) {
  try {
    const r = await client.head(ossName);
    const meta = r.meta || {};
    return meta.sha1 || (r.res && r.res.headers['x-oss-meta-sha1']) || null;
  } catch (e) {
    if (e.status === 404 || e.code === 'NoSuchKey') return undefined; // 不存在
    throw e;
  }
}

function upload(localPath, ossName, sha1) {
  return client.put(ossName, localPath, {
    headers: {
      'x-oss-object-acl': 'public-read',
      'x-oss-meta-sha1': sha1,
    },
  });
}

function writeSha1Txt(localPath, sha1) {
  fs.writeFileSync(localPath + SHA1_SUFFIX, sha1 + '\n');
}

// ---------- 主流程 ----------
async function main() {
  const { dir, opts } = parseArgs(process.argv.slice(2));
  // 省略目录时默认指向脚本上级的「图片/」目录；默认目录场景下自动递归（图片库天然分层）
  const usedDefaultDir = !dir;
  const targetDir = path.resolve(dir || DEFAULT_IMAGE_DIR);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`目录不存在: ${targetDir}`);
    process.exit(1);
  }
  const recursive = usedDefaultDir ? true : opts.recursive;

  loadEnv(opts);

  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET;
  const region = process.env.OSS_REGION;
  const endpoint = process.env.OSS_ENDPOINT;
  if (!accessKeyId || !accessKeySecret || !bucket || !region || !endpoint) {
    console.error('缺少 OSS 环境变量（OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_REGION / OSS_ENDPOINT）');
    process.exit(1);
  }

  client = new OSS({
    accessKeyId,
    accessKeySecret,
    region,
    bucket,
    endpoint,
    secure: true,
  });

  const files = walk(targetDir, recursive).sort();
  if (files.length === 0) {
    console.log('目录下没有图片文件。');
    return;
  }

  const stat = { uploaded: 0, overwritten: 0, ignored: 0 };

  for (const full of files) {
    const rel = path.relative(targetDir, full).split(path.sep).join('/');
    const ossName = toOssName(rel);
    const sha1 = sha1File(full);

    const online = await getOnlineSha1(ossName);
    let action;
    if (online === undefined) action = 'upload-new';
    else if (online === null) action = 'overwrite';
    else if (online === sha1) action = 'ignore';
    else action = 'overwrite';

    if (action === 'ignore') {
      console.log(`  SKIP (sha1 一致): ${rel} -> ${ossName}`);
      stat.ignored++;
      continue;
    }

    await upload(full, ossName, sha1);
    writeSha1Txt(full, sha1);

    if (action === 'upload-new') {
      console.log(`  UPLOAD: ${rel} -> ${ossName}`);
      stat.uploaded++;
    } else {
      console.log(`  OVERWRITE (sha1 不一致): ${rel} -> ${ossName}`);
      stat.overwritten++;
    }
  }

  console.log('----------------------------------------');
  console.log(`完成: 新增 ${stat.uploaded} | 覆盖 ${stat.overwritten} | 忽略 ${stat.ignored}`);
}

main().catch((e) => {
  console.error('执行失败:', e);
  process.exit(1);
});
