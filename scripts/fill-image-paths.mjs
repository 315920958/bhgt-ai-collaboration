// 把 Excel 里人工填的「纯中文文件名」补全为真实的 OSS 相对路径
// 规则（用户确认 2026-08-08）：
//   1. 在 图片/ 目录下按【完全同名文件名】递归查找（如填「平儿.jpg」，实际在 图片/cg/清纯/平儿.jpg）
//   2. 找到则改写为「/相对图片根的路径」即 OSS key（/cg/清纯/平儿.jpg）
//   3. 已是带 / 的路径则不动；图片目录下无同名则保留原名并告警
//   4. 保留中文名，不转拼音（人类可读）
// 用法：node scripts/fill-image-paths.mjs [输入xlsx] [输出xlsx]
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const picRoot = path.join(root, '图片')
const inFile = process.argv[2] || path.join(root, '剧情配置', '事件与节点配置表.xlsx')
const outFile = process.argv[3] || path.join(root, '剧情配置', '事件与节点配置表_已补全路径.xlsx')

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.heic', '.avif'])
const IMAGE_HEADERS = ['配图', '战斗成功图', '战斗失败图']

// 1) 建立 纯文件名 -> /相对图片根路径 映射
const nameToRel = {}
function walk (dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) { walk(full); continue }
    const ext = path.extname(ent.name).toLowerCase()
    if (!IMG_EXT.has(ext) || ent.name === '.DS_Store') continue
    const rel = path.relative(picRoot, full).split(path.sep).join('/')
    if (!(ent.name in nameToRel)) nameToRel[ent.name] = '/' + rel
    else console.warn('⚠️ 重复文件名（取首个）:', ent.name, '->', rel)
  }
}
walk(picRoot)
console.log('📷 图片索引:', JSON.stringify(nameToRel, null, 2))

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(inFile)

let changed = 0
let missing = 0

for (const ws of [wb.getWorksheet('事件'), wb.getWorksheet('剧情节点')]) {
  if (!ws) continue
  const imgCols = []
  for (let c = 1; c <= ws.columnCount; c++) {
    const h = ws.getCell(1, c).value
    if (h && IMAGE_HEADERS.includes(String(h))) imgCols.push(c)
  }
  if (imgCols.length === 0) continue
  for (let r = 2; r <= ws.rowCount; r++) {
    for (const c of imgCols) {
      const raw = ws.getCell(r, c).value
      if (!raw) continue
      const s = String(raw).trim()
      if (s.includes('/')) continue // 已是路径，不动
      const ext = path.extname(s).toLowerCase()
      if (!IMG_EXT.has(ext)) continue // 非图片列值，跳过
      if (nameToRel[s]) {
        ws.getCell(r, c).value = nameToRel[s]
        changed++
        console.log(`  ✏️  ${ws.name} 行${r}: ${s} -> ${nameToRel[s]}`)
      } else {
        missing++
        console.warn(`  ❓ [未找到] ${ws.name} 行${r}: ${s}（图片/ 下无同名文件，保留原名）`)
      }
    }
  }
}

await wb.xlsx.writeFile(outFile)
console.log(`\n✅ 完成：改写 ${changed} 处，未找到 ${missing} 处。输出 -> ${outFile}`)
