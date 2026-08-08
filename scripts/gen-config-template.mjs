// 生成 BHGT《事件与节点配置表》Excel 模板
// 设计（用户确认 2026-08-08 纠正版）：
//   - 填写者【只填中文名】，不填编号；中文名全局唯一
//   - 填写者只填两样：自己的「中文名」 + 「父中文名」（只管自己的爹是谁）
//   - 「编号」「code」由机器（resolve-config.mjs）从「中文名→父中文名」的树生成
//   - 任何「别的节点把它当终点」的额外边（强行当爹）一律无视，编号只看声明的父
//   - 图片只填中文文件名，由 fill-image-paths.mjs 按同名补全真实 OSS 相对路径（不转拼音）
//   - 按钮/战斗的跳转目标填【目标中文名】，机器再翻成 code
// 两个 sheet：事件（nodeBundle）、剧情节点（node）；第一行=表头（解析跳过），第二行起数据
// 用法：node scripts/gen-config-template.mjs
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, '剧情配置')
const outFile = path.join(outDir, '事件与节点配置表.xlsx')

// ===== 事件 sheet 表头（填写者列，无编号/无 code）=====
const headersEvent = ['中文名', '父中文名', '所属阶段', '描述', '配图(中文名)']

// ===== 剧情节点 sheet 表头 =====
const headersNode = [
  '中文名', '父中文名', '标题', '所属阶段', '正文',
  '配图(中文名)', '是否战斗', '按钮数', '完成开商店',
  '战斗成功图(中文名)', '战斗失败图(中文名)',
  '战斗成功文案', '战斗失败文案', '战斗成功效果JSON', '战斗失败效果JSON', '战斗成功目标中文名', '战斗失败目标中文名',
  '按钮1文案', '按钮1类型', '按钮1必现', '按钮1权重', '按钮1条件JSON', '按钮1消耗JSON', '按钮1效果JSON', '按钮1目标中文名',
  '按钮2文案', '按钮2类型', '按钮2必现', '按钮2权重', '按钮2条件JSON', '按钮2消耗JSON', '按钮2效果JSON', '按钮2目标中文名',
  '按钮3文案', '按钮3类型', '按钮3必现', '按钮3权重', '按钮3条件JSON', '按钮3消耗JSON', '按钮3效果JSON', '按钮3目标中文名'
]

// 用对象 → 按表头映射，保证每行长度 == headersNode.length，杜绝手数对不齐
function mkNode (o) {
  const a = new Array(headersNode.length).fill('')
  const set = (k, v) => { const i = headersNode.indexOf(k); if (i >= 0) a[i] = v == null ? '' : v }
  set('中文名', o.name); set('父中文名', o.parent); set('标题', o.title); set('所属阶段', o.stage); set('正文', o.text)
  set('配图(中文名)', o.img); set('是否战斗', o.battle); set('按钮数', o.btn); set('完成开商店', o.shop)
  set('战斗成功图(中文名)', o.bImg); set('战斗失败图(中文名)', o.fImg)
  set('战斗成功文案', o.bTxt); set('战斗失败文案', o.fTxt)
  set('战斗成功效果JSON', o.bEff); set('战斗失败效果JSON', o.fEff)
  set('战斗成功目标中文名', o.bTgt); set('战斗失败目标中文名', o.fTgt)
  for (let k = 1; k <= 3; k++) {
    const b = o.buttons && o.buttons[k - 1]
    if (!b) continue
    set(`按钮${k}文案`, b.text); set(`按钮${k}类型`, b.type); set(`按钮${k}必现`, b.req); set(`按钮${k}权重`, b.weight)
    set(`按钮${k}条件JSON`, b.cond); set(`按钮${k}消耗JSON`, b.cost); set(`按钮${k}效果JSON`, b.eff); set(`按钮${k}目标中文名`, b.target)
  }
  return a
}

// ===== 示例数据（只填中文名 + 父中文名，无编号/无 code）=====
// 父中文名留空 = 顶级事件
const eventRows = [
  ['初入青云', '', '青云篇', '主角初到青云宗外门', '平儿.jpg'],
  ['青云内门', '', '青云篇', '入门后内门修行', '袭人.jpg']
]

const nodeRows = [
  mkNode({
    name: '山门之前', parent: '初入青云', title: '山门之前', stage: '青云篇',
    text: '你立于青云宗山门前，云雾缭绕。', img: '平儿.jpg', battle: '否', btn: '3', shop: '否',
    buttons: [
      { text: '叩响山门', type: 'normal', req: '否', weight: '1', target: '叩门' },
      { text: '暗中观察', type: 'normal', req: '否', weight: '1', target: '观望' },
      { text: '转身离去', type: 'normal', req: '否', weight: '1', target: '初入青云' }
    ]
  }),
  mkNode({
    name: '叩门', parent: '山门之前', title: '叩响山门', stage: '青云篇',
    text: '你叩响山门。', img: '袭人.jpg', battle: '否', btn: '1', shop: '否',
    buttons: [{ text: '前往正厅', type: 'normal', req: '否', weight: '1', target: '正厅' }]
  }),
  mkNode({
    name: '观望', parent: '山门之前', title: '暗中观察', stage: '青云篇',
    text: '你暗中观察四周。', battle: '否', btn: '1', shop: '否',
    buttons: [{ text: '前往正厅', type: 'normal', req: '否', weight: '1', target: '正厅' }]
  }),
  mkNode({
    name: '正厅', parent: '叩门', title: '正厅相遇', stage: '青云篇',
    text: '东厢与西厢在此汇聚——但编号只看「父中文名=叩门」。', battle: '否', btn: '0', shop: '否'
    // 注意：观望 的按钮也指向「正厅」，那是「强行当爹」的额外边，编号无视之
  }),
  mkNode({
    name: '内门入口', parent: '青云内门', title: '内门入口', stage: '青云篇',
    text: '你踏入内门。', img: '袭人.jpg', battle: '否', btn: '1', shop: '否',
    buttons: [{ text: '深入内门', type: 'normal', req: '否', weight: '1', target: '内门深处' }]
  }),
  mkNode({
    name: '内门深处', parent: '内门入口', title: '内门深处', stage: '青云篇',
    text: '内门幽深。', battle: '否', btn: '1', shop: '否',
    buttons: [{ text: '回山门', type: 'normal', req: '否', weight: '1', target: '山门之前' }]
  })
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
wsEv.columns = headersEvent.map((h) => ({ header: h, width: 16 }))
wsEv.addRows(eventRows)
styleHeader(wsEv, headersEvent.length)

const wsNd = wb.addWorksheet('剧情节点')
wsNd.columns = headersNode.map((h) => ({ header: h, width: 13 }))
wsNd.addRows(nodeRows)
styleHeader(wsNd, headersNode.length)
wsNd.getColumn(5).width = 32 // 正文
wsNd.getColumn(1).width = 14 // 中文名

await wb.xlsx.writeFile(outFile)
console.log('✅ 模板已生成:', outFile)
console.log('   事件 sheet 行数:', eventRows.length, '| 剧情节点 sheet 行数:', nodeRows.length)
console.log('   填写者只填「中文名 + 父中文名」，编号/code 由 resolve-config.mjs 生成')
console.log('   每行长度校验: 事件=', headersEvent.length, ' 节点=', headersNode.length,
  ' 实际=', eventRows.every((r) => r.length === headersEvent.length) && nodeRows.every((r) => r.length === headersNode.length) ? 'OK' : 'MISMATCH!')
