// 解析《事件与节点配置表》：机器生成 编号 + code，并把按钮/战斗目标中文名解析为 code
// 输入：图片已补全路径的 xlsx（默认 事件与节点配置表_已补全路径.xlsx）
// 输出：事件与节点配置表_已解析.xlsx（在原表后追加 编号 / code / 各目标code 列）+ 校验 sheet
//
// 核心规则（用户 2026-08-08 纠正）：
//   1. 填写者只填「中文名 + 父中文名」，不填编号
//   2. 中文名全局唯一
//   3. 机器从「中文名→父中文名」建树，DFS 生成编号：
//        顶级（父中文名空）= 1,2,3…；子节点 = 父编号 + "." + 兄弟序号（1.1 / 1.1.1）
//        节点自然继承事件前缀（因为节点是事件的子树）
//   4. code = 事件 nb_<去点编号> / 节点 n_<去点编号>（编号唯一 → code 唯一）
//   5. 【无视强行当爹】：任何按钮/战斗指向造成的「额外父边」不参与编号，编号只看声明的父
//   6. 按钮/战斗「目标中文名」→ 查表翻译成 code，未找到则在 校验 sheet 报错
// 用法：node scripts/resolve-config.mjs [输入xlsx] [输出xlsx]
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const inFile = process.argv[2] || path.join(root, '剧情配置', '事件与节点配置表_已补全路径.xlsx')
const outFile = process.argv[3] || path.join(root, '剧情配置', '事件与节点配置表_已解析.xlsx')

const BUTTON_COUNT = 3
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.heic', '.avif'])

function isImg (v) {
  if (!v) return false
  const s = String(v).trim()
  return IMG_EXT.has(path.extname(s).toLowerCase())
}

// 读取一个 sheet：{ name, headers:[], rows:[[...]] }（表头取第1行，数据从第2行起，跳过全空行）
function readSheet (ws) {
  if (!ws) return null
  const headers = []
  for (let c = 1; c <= ws.columnCount; c++) headers.push(String(ws.getCell(1, c).value || '').trim())
  const rows = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = []
    for (let c = 1; c <= ws.columnCount; c++) row.push(ws.getCell(r, c).value)
    if (row.every((v) => v === null || v === undefined || String(v).trim() === '')) continue
    rows.push(row)
  }
  return { name: ws.name, headers, rows }
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(inFile)

const ev = readSheet(wb.getWorksheet('事件'))
const nd = readSheet(wb.getWorksheet('剧情节点'))

const errors = []
const warnings = []
const elements = [] // {name, parentName, type, srcSheet, row}

function collect (sheet, type) {
  if (!sheet) return
  const nameIdx = sheet.headers.indexOf('中文名')
  const parIdx = sheet.headers.indexOf('父中文名')
  if (nameIdx < 0) { errors.push(`【${type}】sheet 缺少「中文名」列`); return }
  sheet.rows.forEach((row) => {
    const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : ''
    if (!name) return
    const parentName = parIdx >= 0 && row[parIdx] != null ? String(row[parIdx]).trim() : ''
    elements.push({ name, parentName, type, srcSheet: sheet, row })
  })
}
collect(ev, '事件')
collect(nd, '剧情节点')

// 1) 中文名唯一性
const nameMap = {}
for (const e of elements) {
  if (nameMap[e.name]) errors.push(`中文名重复：「${e.name}」出现多次（必须唯一）`)
  else nameMap[e.name] = e
}

// 2) 解析父 + 建树（只认声明的父；额外边由编号规则自然无视）
const childrenMap = {}
for (const e of elements) {
  if (e.parentName) {
    const p = nameMap[e.parentName]
    if (!p) errors.push(`「${e.name}」的父中文名「${e.parentName}」未找到`)
    else { e.parent = p; (childrenMap[p.name] = childrenMap[p.name] || []).push(e) }
  } else {
    e.parent = null
    if (e.type === '剧情节点') warnings.push(`剧情节点「${e.name}」未填父中文名（将作为顶级编号）`)
  }
}

// 3) DFS 编号（顶级按 elements 顺序，子节点按出现序）
function numberDFS (e, prefix, idx) {
  e.no = prefix ? `${prefix}.${idx}` : String(idx)
  e.code = (e.type === '事件' ? 'nb_' : 'n_') + e.no.replace(/\./g, '')
  for (const k of (childrenMap[e.name] || [])) numberDFS(k, e.no, (childrenMap[e.name].indexOf(k)) + 1)
}
let rootIdx = 0
for (const e of elements) if (!e.parent) { rootIdx++; numberDFS(e, '', rootIdx) }

// 4) 目标中文名 → code
function resolveTarget (name, fromName) {
  if (!name) return ''
  const t = nameMap[name]
  if (!t) { errors.push(`「${fromName}」的目标中文名「${name}」未找到`); return '' }
  return t.code
}

// 5) 重建输出 workbook（原表头 + 追加列）
const outWb = new ExcelJS.Workbook()
outWb.creator = 'BHGT'
outWb.created = new Date()

function rebuild (sheet) {
  if (!sheet) return
  const btnTargetCols = []
  for (let k = 1; k <= BUTTON_COUNT; k++) {
    const i = sheet.headers.indexOf(`按钮${k}目标中文名`)
    if (i >= 0) btnTargetCols.push({ k, i })
  }
  const bsIdx = sheet.headers.indexOf('战斗成功目标中文名')
  const bfIdx = sheet.headers.indexOf('战斗失败目标中文名')

  const headers = [...sheet.headers, '编号', 'code']
  btnTargetCols.forEach((b) => headers.push(`按钮${b.k}目标code`))
  if (bsIdx >= 0) headers.push('战斗成功目标code')
  if (bfIdx >= 0) headers.push('战斗失败目标code')

  const ws = outWb.addWorksheet(sheet.name)
  ws.columns = headers.map((h) => ({ header: h, width: 14 }))
  for (const e of elements.filter((x) => x.srcSheet === sheet)) {
    const row = [...e.row]
    row.push(e.no || '', e.code || '')
    for (const b of btnTargetCols) {
      const name = e.row[b.i] != null ? String(e.row[b.i]).trim() : ''
      row.push(resolveTarget(name, e.name))
    }
    if (bsIdx >= 0) row.push(resolveTarget(e.row[bsIdx] != null ? String(e.row[bsIdx]).trim() : '', e.name))
    if (bfIdx >= 0) row.push(resolveTarget(e.row[bfIdx] != null ? String(e.row[bfIdx]).trim() : '', e.name))
    ws.addRow(row)
  }
  for (let c = 1; c <= headers.length; c++) {
    const cell = ws.getCell(1, c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0D0' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  ws.getRow(1).height = 28
  if (sheet.name === '剧情节点') { ws.getColumn(5).width = 32; ws.getColumn(1).width = 14 }
}
rebuild(ev)
rebuild(nd)

// 6) 校验 sheet
const wsChk = outWb.addWorksheet('校验')
wsChk.columns = [{ header: '级别', width: 10 }, { header: '信息', width: 90 }]
if (errors.length === 0 && warnings.length === 0) {
  wsChk.addRow(['OK', '✅ 全部校验通过：中文名唯一、父/目标均可解析、编号已生成'])
} else {
  errors.forEach((e) => wsChk.addRow(['ERROR', e]))
  warnings.forEach((w) => wsChk.addRow(['WARN', w]))
}
wsChk.getCell(1, 1).font = { bold: true }

await outWb.xlsx.writeFile(outFile)

console.log('\n📋 编号结果（机器生成）：')
for (const e of elements) {
  console.log(`  ${e.no}\t${e.code}\t[${e.type}]\t${e.name}  (父: ${e.parentName || '—'})`)
}
console.log(`\n校验：${errors.length} 错误 / ${warnings.length} 警告`)
console.log('✅ 已解析输出:', outFile)
