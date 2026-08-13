import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pinyin } = await import('pinyin-pro');

const HAS_CJK = /[一-鿿]/;
function toOssSegment(seg) {
  const ext = path.extname(seg).toLowerCase();
  const base = path.basename(seg, path.extname(seg));
  if (!HAS_CJK.test(base)) return seg;
  let py = pinyin(base, { toneType: 'none', nonZh: 'consecutive' });
  py = py.toLowerCase().replace(/\s+/g, '');
  py = py.replace(/[^a-z0-9_\-]/g, '');
  if (!py) py = createHash('sha1').update(base).digest('hex').slice(0, 12);
  return py + ext;
}
function toOssName(rel) {
  return rel.split('/').map(toOssSegment).join('_');
}

const cases = [
  '风景/北京/莲池湖.jpg',
  '风景/北京/莲池湖.JPG',
  'Photos/北京/莲池湖.png',
  '风景/2024游记/日落.jpg',
  'already_english/lake.jpg',
  '莲池湖.jpg',
];
for (const c of cases) console.log(c, '->', toOssName(c));
