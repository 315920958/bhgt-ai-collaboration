// 生成 BHGT《事件与节点配置表》Excel 模板
// 两个 sheet：事件（nodeBundle）、剧情节点（node）
// 第一行=表头（解析时跳过），第二行起为数据
// 用法：node scripts/gen-config-template.mjs
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, '剧情配置')
const outFile = path.join(outDir, '事件与节点配置表.xlsx')

const headersEvent = ['行类型', '编号', '父编号', 'code', '名称', '所属阶段', '描述']

const headersNode = [
  '行类型', '编号', '父编号', 'code', '名称', '标题', '所属阶段', '所属事件编号', '正文',
  '配图', '是否战斗', '按钮数', '完成开商店',
  '战斗成功图', '战斗失败图', '战斗成功文案', '战斗失败文案', '战斗成功效果JSON', '战斗失败效果JSON', '战斗成功跳转编号', '战斗失败跳转编号',
  '按钮1文案', '按钮1类型', '按钮1必现', '按钮1权重', '按钮1条件JSON', '按钮1消耗JSON', '按钮1效果JSON', '按钮1跳转编号',
  '按钮2文案', '按钮2类型', '按钮2必现', '按钮2权重', '按钮2条件JSON', '按钮2消耗JSON', '按钮2效果JSON', '按钮2跳转编号',
  '按钮3文案', '按钮3类型', '按钮3必现', '按钮3权重', '按钮3条件JSON', '按钮3消耗JSON', '按钮3效果JSON', '按钮3跳转编号'
]

// 示例数据（演示：树状编号 / 节点级汇聚 / 事件级汇聚 / 中文图名 / 跨事件跳转）
const eventRows = [
  ['event', '1', '', 'nb_qingyun', '初入青云', '青云篇', '主角初到青云宗外门'],
  ['event', '2', '', 'nb_neimen', '青云内门', '青云篇', '入门后内门修行'],
  ['event', '1.5.1', '1.5', 'nb_zhengting', '正厅相遇', '青云篇', '东厢西厢汇聚的事件级终点（被 1.5 与 2.x 指向，取最小父 1.5）']
]

const nodeRows = [
  ['node', '1.1', '1', 'n_shanmen', '山门之前', '山门之前', '青云篇', '1', '你立于青云宗山门前，云雾缭绕。', '平儿.jpg', '否', '3', '否',
    '', '', '', '', '', '', '',
    '叩响山门', 'normal', '否', '1', '', '', '', '1.1.1',
    '暗中观察', 'normal', '否', '1', '', '', '', '1.1.2',
    '转身离去', 'normal', '否', '1', '', '', '', '2'],
  ['node', '1.1.1', '1.1', 'n_koumen', '叩门', '叩响山门', '青云篇', '1', '你叩响山门。', '袭人.jpg', '否', '1', '否',
    '', '', '', '', '', '', '',
    '前往正厅', 'normal', '否', '1', '', '', '', '1.1.1.1',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', ''],
  ['node', '1.1.2', '1.1', 'n_guankan', '观望', '暗中观察', '青云篇', '1', '你暗中观察四周。', '', '否', '1', '否',
    '', '', '', '', '', '', '',
    '前往正厅', 'normal', '否', '1', '', '', '', '1.1.1.1',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', ''],
  ['node', '1.1.1.1', '1.1.1', 'n_zhengting', '正厅', '正厅相遇', '青云篇', '1', '东厢与西厢在此汇聚。', '', '否', '0', '否',
    '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', ''],
  ['node', '2.1', '2', 'n_neimen_ru', '内门入口', '内门入口', '青云篇', '2', '你踏入内门。', '袭人.jpg', '否', '1', '否',
    '', '', '', '', '', '', '',
    '前往正厅相遇', 'normal', '否', '1', '', '', '', '1.5.1',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '']
]

function styleHeader (ws, ncols) {
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getCell(1, c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0D0' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  ws.getRow(1).height = 28
}

fs.mkdirSync(outDir, { recursive: true })

const wb = new ExcelJS.Workbook()
wb.creator = 'BHGT'
wb.created = new Date()

const wsEv = wb.addWorksheet('事件')
wsEv.columns = headersEvent.map((h) => ({ header: h, width: 14 }))
wsEv.addRows(eventRows)
styleHeader(wsEv, headersEvent.length)

const wsNd = wb.addWorksheet('剧情节点')
wsNd.columns = headersNode.map((h) => ({ header: h, width: 13 }))
wsNd.addRows(nodeRows)
styleHeader(wsNd, headersNode.length)
wsNd.getColumn(10).width = 16
wsNd.getColumn(9).width = 30

await wb.xlsx.writeFile(outFile)
console.log('✅ 模板已生成:', outFile)
console.log('   事件 sheet 行数:', eventRows.length, '| 剧情节点 sheet 行数:', nodeRows.length)
