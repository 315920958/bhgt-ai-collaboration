// 解析《事件与节点配置表》：机器生成 编号 + code，并把按钮目标中文名解析为 code
// 输入：图片已补全路径的 xlsx（默认 事件与节点配置表_已补全路径.xlsx）
// 输出：事件与节点配置表_已解析.xlsx（在原表后追加 编号 / code / 各目标code 列）+ 校验 sheet
//
// 核心规则（用户 2026-08-09 三 sheet 精简版）：
//   1. 事件：填写「中文名」，ID 列留空由 AI 生成；无父中文名（事件是根级）
//   2. 节点：填写「节点名称(中文名)」+「所属事件(=父中文名)」；节点ID 列留空
//   3. 按钮：独立 sheet，每行一个按钮，用「关联节点中文名」+「目标中文名」
//   4. 中文名全局唯一
//   5. 机器从「中文名→父中文名」建树，DFS 生成编号：
//        顶级（事件，无父）= 1,2,3…；子节点 = 父编号 + "." + 兄弟序号（1.1 / 1.1.1）
//        节点自然继承事件前缀（因为节点是事件的子树）
//   6. code = 事件 nb_<去点编号> / 节点 n_<去点编号>（编号唯一 → code 唯一）
//   7. 【无视强行当爹】：任何按钮指向造成的「额外父边」不参与编号
//   8. 按钮「目标中文名」→ 查表翻译成 code，未找到则在 校验 sheet 报错
// 用法：node scripts/resolve-config.mjs [输入xlsx] [输出xlsx]
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const inFile = process.argv[2] || path.join(root, '剧情配置', '事件与节点配置表_已补全路径.xlsx')
const outFile = process.argv[3] || path.join(root, '剧情配置', '事件与节点配置表_已解析.xlsx')

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
const btn = readSheet(wb.getWorksheet('按钮'))

const errors = []
const warnings = []

// ---- 收集事件和节点元素 ----
const elements = [] // {name, parentName, type, srcSheet, row}
const nameMap = {}   // 中文名 → element

function collectEvent (sheet) {
  if (!sheet) return
  const nameIdx = sheet.headers.indexOf('中文名')
  if (nameIdx < 0) { errors.push('【事件】sheet 缺少「中文名」列'); return }
  sheet.rows.forEach((row) => {
    const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : ''
    if (!name) return
    // 事件无父（根级）
    const e = { name, parentName: '', type: '事件', srcSheet: sheet, row }
    elements.push(e)
    nameMap[name] = e
  })
}

function collectNode (sheet) {
  if (!sheet) return
  const nameIdx = sheet.headers.indexOf('节点名称')
  const parIdx = sheet.headers.indexOf('所属事件') // = 父中文名
  if (nameIdx < 0) { errors.push('【剧情节点】sheet 缺少「节点名称」列'); return }
  sheet.rows.forEach((row) => {
    const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : ''
    if (!name) return
    const parentName = parIdx >= 0 && row[parIdx] != null ? String(row[parIdx]).trim() : ''
    const e = { name, parentName, type: '剧情节点', srcSheet: sheet, row }
    elements.push(e)
    if (nameMap[name]) errors.push(`中文名重复：「${name}」出现多次（必须唯一）`)
    else nameMap[name] = e
  })
}

collectEvent(ev)
collectNode(nd)

// ---- 校验 + 建树 ----
const childrenMap = {}
for (const e of elements) {
  if (e.parentName) {
    const p = nameMap[e.parentName]
    if (!p) errors.push(`「${e.name}」的父中文名「${e.parentName}」未找到`)
    else { e.parent = p; (childrenMap[p.name] = childrenMap[p.name] || []).push(e) }
  } else {
    e.parent = null
    if (e.type === '剧情节点') warnings.push(`剧情节点「${e.name}」未填所属事件（将作为顶级编号）`)
  }
}

// DFS 编号
function numberDFS (e, prefix, idx) {
  e.no = prefix ? `${prefix}.${idx}` : String(idx)
  e.code = (e.type === '事件' ? 'nb_' : 'n_') + e.no.replace(/\./g, '')
  const siblings = childrenMap[e.name] || []
  for (let k = 0; k < siblings.length; k++) numberDFS(siblings[k], e.no, k + 1)
}
let rootIdx = 0
for (const e of elements) if (!e.parent) { rootIdx++; numberDFS(e, '', rootIdx) }

// ---- 按钮目标解析 ----
function resolveTarget (name, fromLabel) {
  if (!name) return ''
  const t = nameMap[String(name).trim()]
  if (!t) { errors.push(`「${fromLabel}」的目标中文名「${name}」未找到`); return '' }
  return t.code
}

// 收集按钮行（用于重建按钮 sheet）
const btnResolvedRows = []
if (btn) {
  const nodeNameIdx = btn.headers.indexOf('关联节点中文名')
  const tgtIdx = btn.headers.indexOf('目标中文名')
  if (nodeNameIdx < 0) errors.push('【按钮】sheet 缺少「关联节点中文名」列')
  else {
    btn.rows.forEach((row) => {
      const nodeName = row[nodeNameIdx] != null ? String(row[nodeNameIdx]).trim() : ''
      const tgtName = tgtIdx >= 0 && row[tgtIdx] != null ? String(row[tgtIdx]).trim() : ''
      const tgtCode = resolveTarget(tgtName, `按钮@${nodeName}`)
      btnResolvedRows.push({ rawRow: row, tgtCode })
    })
  }
}

// ---- 重建输出 workbook ----
const outWb = new ExcelJS.Workbook()
outWb.creator = 'BHGT'
outWb.created = new Date()

function styleHeader (ws, ncols) {
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getCell(1, c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0D0' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  ws.getRow(1).height = 28
}

// --- Sheet 1: 事件（原表头 + 编号 + code）---
if (ev) {
  const headers = [...ev.headers, '编号', 'code']
  const ws = outWb.addWorksheet('事件')
  ws.columns = headers.map((h) => ({ header: h, width: 16 }))
  for (const e of elements.filter((x) => x.srcSheet === ev)) {
    const row = [...e.row]
    row.push(e.no || '', e.code || '')
    ws.addRow(row)
  }
  styleHeader(ws, headers.length)
}

// --- Sheet 2: 剧情节点（原表头 + 编号 + code）---
if (nd) {
  const headers = [...nd.headers, '编号', 'code']
  const ws = outWb.addWorksheet('剧情节点')
  ws.columns = headers.map((h) => ({ header: h, width: 13 }))
  for (const e of elements.filter((x) => x.srcSheet === nd)) {
    const row = [...e.row]
    row.push(e.no || '', e.code || '')
    ws.addRow(row)
  }
  styleHeader(ws, headers.length)
  ws.getColumn(5).width = 32  // 正文
  ws.getColumn(2).width = 14  // 名称
}

// --- Sheet 3: 按钮（原表头 + 目标code）---
if (btn) {
  const headers = [...btn.headers, '目标code']
  const ws = outWb.addWorksheet('按钮')
  ws.columns = headers.map((h) => ({ header: h, width: 13 }))
  for (const br of btnResolvedRows) {
    const row = [...br.rawRow]
    row.push(br.tgtCode)
    ws.addRow(row)
  }
  styleHeader(ws, headers.length)
}

// --- Sheet 4: 校验 ---
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
