// 生成 BHGT《事件与节点配置表》Excel 模板
// 设计（用户确认 2026-08-09 三 sheet 精简版）：
//   - 填写者【只填中文名】，不填编号；中文名全局唯一
//   - 事件：填写「中文名」，ID 列留空（AI 帮着生成），无父中文名（事件是根）
//   - 节点：填写「节点名称(中文名)」+「所属事件(父中文名)」；节点 ID 留空
//   - 按钮：独立 sheet，每行一个按钮，用「关联节点中文名」关联到节点
//   - 节点只保留基础配置字段（不含战斗子字段）；战斗成功/失败效果JSON、目标等全不要
//   - 图片只填中文文件名，由 fill-image-paths.mjs 按同名补全真实 OSS 相对路径
//   - 编号/code 由 resolve-config.mjs 从「中文名→父中文名」的树生成
//   - 「强行当爹」（别的元素把它当终点）一律无视
// 三个 sheet：事件 / 剧情节点 / 按钮；第一行=表头（解析跳过），第二行起数据
// 用法：node scripts/gen-config-template.mjs
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, '剧情配置')
const outFile = path.join(outDir, '事件与节点配置表.xlsx')

// ===== 表头 =====
const H_EVENT = ['中文名', 'ID', '所属阶段', '描述', '配图(中文名)']

const H_NODE = [
  '节点ID', '节点名称', '所属阶段', '所属事件',
  '剧情标题', '剧情正文', '配图(中文名)',
  '显示按钮数', '战斗节点', '通过后开商店'
]

const H_BTN = [
  '关联节点中文名', '序号', '文案', '类型', '必现', '权重', '目标中文名'
]

// ===== 节点行构造器（按表头映射，杜绝手数数组对不齐）=====
function mkNode (o) {
  const a = new Array(H_NODE.length).fill('')
  const set = (k, v) => { const i = H_NODE.indexOf(k); if (i >= 0) a[i] = v == null ? '' : v }
  set('节点ID', o.id)
  set('节点名称', o.name)
  set('所属阶段', o.stage)
  set('所属事件', o.parent)       // = 父中文名（所属事件名）
  set('剧情标题', o.title)
  set('剧情正文', o.text)
  set('配图(中文名)', o.img)
  set('显示按钮数', o.btnCount || '3')
  set('战斗节点', o.battle || '否')
  set('通过后开商店', o.shop || '否')
  return a
}

function mkBtn (o) {
  const a = new Array(H_BTN.length).fill('')
  const set = (k, v) => { const i = H_BTN.indexOf(k); if (i >= 0) a[i] = v == null ? '' : v }
  set('关联节点中文名', o.node)
  set('序号', String(o.idx || ''))
  set('文案', o.text)
  set('类型', o.type || 'normal')
  set('必现', o.req || '否')
  set('权重', o.weight || '')
  set('目标中文名', o.target || '')
  return a
}

// ===== 示例数据 =====
const eventRows = [
  ['初入青云', '', '青云篇', '主角初到青云宗外门', '平儿.jpg'],
  ['青云内门', '', '青云篇', '入门后内门修行', '袭人.jpg']
]

const nodeRows = [
  mkNode({
    name: '山门之前', parent: '初入青云', stage: '青云篇',
    title: '山门之前', text: '你立于青云宗山门前，云雾缭绕。', img: '节点一背景.jpg'
    // 按钮在独立按钮 sheet 里定义
  }),
  mkNode({
    name: '叩门', parent: '山门之前', stage: '青云篇',
    title: '叩响山门', text: '你叩响山门。', img: '节点二背景.jpg'
  }),
  mkNode({
    name: '观望', parent: '山门之前', stage: '青云篇',
    title: '暗中观察', text: '你暗中观察四周。', img: '节点三背景.jpg'
  }),
  // 正厅：父=叩门；观望 也指向正厅（强行当爹，编号无视）
  mkNode({
    name: '正厅', parent: '叩门', stage: '青云篇',
    title: '正厅相遇', text: '东厢与西厢在此汇聚——但编号只看声明的父。', btnCount: '0'
  }),
  mkNode({
    name: '内门入口', parent: '青云内门', stage: '青云篇',
    title: '内门入口', text: '你踏入内门。', img: '节点五背景.jpg'
  }),
  mkNode({
    name: '内门深处', parent: '内门入口', stage: '青云篇',
    title: '内门深处', text: '内门幽深。', img: '节点六背景.jpg'
  })
]

const btnRows = [
  // 山门之前的 3 个按钮
  mkBtn({ node: '山门之前', idx: 1, text: '叩响山门', target: '叩门' }),
  mkBtn({ node: '山门之前', idx: 2, text: '暗中观察', target: '观望' }),
  mkBtn({ node: '山门之前', idx: 3, text: '转身离去', target: '初入青云' }),
  // 叩门的 1 个按钮
  mkBtn({ node: '叩门', idx: 1, text: '前往正厅', target: '正厅' }),
  // 观望的 1 个按钮（也指向正厅 = 强行当爹的边）
  mkBtn({ node: '观望', idx: 1, text: '前往正厅', target: '正厅' }),
  // 内门入口
  mkBtn({ node: '内门入口', idx: 1, text: '深入内门', target: '内门深处' }),
  // 内门深处（跨事件跳转回山门之前）
  mkBtn({ node: '内门深处', idx: 1, text: '回山门', target: '山门之前' })
]

// ===== 样式 =====
function styleHeader (ws, ncols) {
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getCell(1, c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0D0' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  ws.getRow(1).height = 28
}

// ===== 写出 =====
fs.mkdirSync(outDir, { recursive: true })

const wb = new ExcelJS.Workbook()
wb.creator = 'BHGT'
wb.created = new Date()

// --- Sheet 1: 事件 ---
const wsEv = wb.addWorksheet('事件')
wsEv.columns = H_EVENT.map((h) => ({ header: h, width: 16 }))
wsEv.addRows(eventRows)
styleHeader(wsEv, H_EVENT.length)

// --- Sheet 2: 剧情节点 ---
const wsNd = wb.addWorksheet('剧情节点')
wsNd.columns = H_NODE.map((h) => ({ header: h, width: 13 }))
wsNd.addRows(nodeRows)
styleHeader(wsNd, H_NODE.length)
wsNd.getColumn(5).width = 32  // 正文
wsNd.getColumn(2).width = 14  // 名称

// --- Sheet 3: 按钮 ---
const wsBtn = wb.addWorksheet('按钮')
wsBtn.columns = H_BTN.map((h) => ({ header: h, width: 13 }))
wsBtn.addRows(btnRows)
styleHeader(wsBtn, H_BTN.length)

await wb.xlsx.writeFile(outFile)
console.log('✅ 模板已生成:', outFile)
console.log(`   事件: ${eventRows.length} 行 | 剧情节点: ${nodeRows.length} 行 | 按钮: ${btnRows.length} 行`)
console.log('   每行长度校验:',
  '事件=', eventRows.every((r) => r.length === H_EVENT.length),
  '| 节点=', nodeRows.every((r) => r.length === H_NODE.length),
  '| 按钮=', btnRows.every((r) => r.length === H_BTN.length))
