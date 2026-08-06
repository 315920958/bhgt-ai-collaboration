/* 从 index.html 拆分交付物：
   1. design-tokens.css（变量+组件样式，去掉demo导航）
   2. 24 个独立页面 HTML（引用 tokens）
   运行: node _split.js */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(SRC, "utf8");

/* ---------- 1. 提取 CSS ---------- */
const cssFull = html.match(/<style>([\s\S]*?)<\/style>/)[1];

// demo 导航专用选择器，交付版删除（开发集成到自己框架，用不上）
const DROP = [
  /\.app\{[^}]*\}/,
  /\.sidebar\{[\s\S]*?\n\}/,
  /\.sidebar-logo\{[\s\S]*?\n\}/,
  /\.sidebar-logo h1\{[\s\S]*?\n\}/,
  /\.sidebar-logo p\{[\s\S]*?\n\}/,
  /\.nav-group\{[^}]*\}/,
  /\.nav-group-title\{[\s\S]*?\n\}/,
  /\.nav-item\{[\s\S]*?\n\}/,
  /\.nav-item:hover[^}]*\}/,
  /\.nav-item\.active\{[\s\S]*?\n\}/,
  /\.main\{[\s\S]*?\n\}/,
  /\.page\{[^}]*\}/,
  /\.page\.active\{[^}]*\}/,
];
let tokens = cssFull;
DROP.forEach(re => { tokens = tokens.replace(re, ""); });
// body overflow:hidden 是 demo 单屏用的，独立页面恢复滚动
tokens = tokens.replace("overflow:hidden;", "");

const HEADER = `/* ============================================================
   宋式仙册 Design Tokens v1.0
   东方修仙人生模拟器 · UI 设计令牌
   用法: <link rel="stylesheet" href="design-tokens.css">
   原则: 宋代修士记录册 · 无渐变 / 无发光 / 无强阴影 / 统一宣纸底
   ============================================================ */
@import url("https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600;700&family=ZCOOL+XiaoWei&display=swap");
/* 字体降级说明: 标题 Ma Shan Zheng → 楷体; 正文 Noto Serif SC → 宋体。
   离线/内网环境 Google Fonts 加载失败时自动降级, 不影响布局。 */

`;
fs.writeFileSync(path.join(__dirname, "design-tokens.css"), HEADER + tokens.trim() + "\n", "utf8");

/* ---------- 2. 提取 NAV 分组映射 ---------- */
const navRaw = html.match(/const NAV = (\[[\s\S]*?\]);/)[1];
const NAV = eval(navRaw);
const DIR = {
  "设计系统": { dir: ".", prefix: "" },
  "玩家端 · 核心界面": { dir: "pages/player", prefix: "player" },
  "玩家端 · 小游戏": { dir: "pages/minigame", prefix: "minigame" },
  "后台 · 配置管理": { dir: "pages/admin", prefix: "admin" },
};

/* ---------- 3. 提取各页面 reg() 内容 ---------- */
const regRe = /reg\("([^"]+)",`([\s\S]*?)`\);/g;
const pages = {};
let m;
while ((m = regRe.exec(html)) !== null) pages[m[1]] = m[2];

/* ---------- 4. 生成独立页面 ---------- */
function pageTpl(title, body, depth) {
  const rel = depth === 0 ? "design-tokens.css" : "../../design-tokens.css";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · 宋式仙册</title>
<link rel="stylesheet" href="${rel}">
<style>
  body{padding:28px 36px;}
  /* 页面内容内层 .page 不再依赖 demo 的 display 切换, 直接显示 */
  .page{display:block !important;min-height:auto;}
</style>
</head>
<body>
${body.trim()}
</body>
</html>
`;
}

const manifest = [];
NAV.forEach(g => {
  const conf = DIR[g.group];
  g.items.forEach(it => {
    const body = pages[it.id];
    if (!body) { console.error("缺失页面:", it.id); return; }
    const depth = conf.dir === "." ? 0 : 2;
    const fname = conf.dir === "." ? `${it.id}.html` : `${it.id}.html`;
    const out = path.join(__dirname, conf.dir, fname);
    fs.writeFileSync(out, pageTpl(it.name, body, depth), "utf8");
    manifest.push({ group: g.group, id: it.id, name: it.name, file: path.relative(__dirname, out).replace(/\\/g, "/") });
  });
});

fs.writeFileSync(path.join(__dirname, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log("design-tokens.css:", (HEADER + tokens).length, "bytes");
console.log("pages:", manifest.length);
manifest.forEach(x => console.log(" ", x.file));
