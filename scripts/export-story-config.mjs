#!/usr/bin/env node
import path from 'node:path'
import ExcelJS from 'exceljs'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import {
  scriptsDir,
  collaborationRoot,
  defaultExport,
  parseArgs,
  styleHeader,
  buildImageIndex,
  toExcelImagePath,
} from './story-config-utils.mjs'

const HELP = `
从 bhgt_test 导出剧情配置 Excel（只读数据库）

用法：
  node export-story-config.mjs
  node export-story-config.mjs --output ../剧情配置/自定义导出.xlsx

参数：
  --output <xlsx>      输出文件
  --mongo-uri <uri>    默认 mongodb://127.0.0.1:47017
  --db-name <name>     默认 bhgt_test
`

const args = parseArgs(process.argv.slice(2))
if (args.flags.has('help')) {
  console.log(HELP.trim())
  process.exit(0)
}

dotenv.config({ path: path.join(scriptsDir, '.env') })
dotenv.config({ path: path.resolve(collaborationRoot, '..', 'bhgt-server', '.env.development') })

const outputPath = path.resolve(args.values.output || defaultExport)
const mongoUri = args.values['mongo-uri'] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:47017'
const dbName = args.values['db-name'] || process.env.DB_NAME || 'bhgt_test'

function yesNo(value) {
  return value ? '是' : '否'
}

function prepareSheet(workbook, name, headers, widths) {
  const worksheet = workbook.addWorksheet(name)
  worksheet.columns = headers.map((header, index) => ({
    header,
    width: widths[index] || 16,
  }))
  styleHeader(worksheet, headers.length)
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  return worksheet
}

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 })
try {
  await client.connect()
  const db = client.db(dbName)
  const [stages, events, nodes] = await Promise.all([
    db.collection('config.stages').find({}).sort({ order: 1, code: 1 }).toArray(),
    db.collection('config.nodeBundles').find({}).sort({ code: 1 }).toArray(),
    db.collection('config.nodes').find({}).sort({ code: 1 }).toArray(),
  ])

  const stageNameById = new Map(stages.map((stage) => [stage._id.toString(), stage.name || stage.code || '']))
  const imageIndex = buildImageIndex()
  const eventByCode = new Map(events.map((event) => [event.code, event]))
  const eventById = new Map(events.map((event) => [event._id.toString(), event]))
  const nodeNameByCode = new Map(nodes.map((node) => [node.code, node.name || node.code]))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BHGT'
  workbook.created = new Date()

  const eventSheet = prepareSheet(
    workbook,
    '事件',
    ['中文名', 'ID', '所属阶段', '描述', '配图(中文名)'],
    [20, 18, 16, 36, 34],
  )
  for (const event of events) {
    eventSheet.addRow([
      event.name || '',
      event.code || '',
      stageNameById.get(event.stageId?.toString()) || event.stageId?.toString() || '',
      event.description || '',
      toExcelImagePath(event.imageUrl, imageIndex),
    ])
  }

  const nodeSheet = prepareSheet(
    workbook,
    '剧情节点',
    ['节点子编号', '节点名称', '所属阶段', '所属事件', '剧情标题', '剧情正文', '配图(中文名)', '显示按钮数', '战斗节点', '通过后开商店'],
    [16, 20, 16, 20, 28, 60, 34, 14, 12, 16],
  )
  for (const node of nodes) {
    const event = eventByCode.get(node.nodeBundleCode) || eventById.get(node.nodeBundleId?.toString())
    const inferredSubCode = event?.code && node.code?.startsWith(`${event.code}_`)
      ? node.code.slice(event.code.length + 1)
      : ''
    nodeSheet.addRow([
      node.nodeSubCode || inferredSubCode,
      node.name || '',
      stageNameById.get(node.stageId?.toString()) || node.stageId?.toString() || '',
      event?.name || node.nodeBundleCode || node.nodeBundleId?.toString() || '',
      node.title || '',
      node.text || '',
      toExcelImagePath(node.imageUrl, imageIndex),
      node.buttonCount ?? 3,
      yesNo(node.isBattle),
      yesNo(node.afterCompletionOpenShop),
    ])
  }
  nodeSheet.getColumn(6).alignment = { vertical: 'top', wrapText: true }

  const buttonSheet = prepareSheet(
    workbook,
    '按钮',
    ['关联节点中文名', '序号', '文案', '类型', '必现', '权重', '目标中文名'],
    [22, 10, 42, 14, 10, 10, 22],
  )
  let buttonCount = 0
  for (const node of nodes) {
    const buttons = Array.isArray(node.buttons) ? node.buttons : []
    for (let index = 0; index < buttons.length; index += 1) {
      const button = buttons[index]
      buttonSheet.addRow([
        node.name || node.code || '',
        index + 1,
        button.text || '',
        button.type || 'normal',
        yesNo(button.isRequired),
        button.weight ?? 0,
        button.nextNodeId ? (nodeNameByCode.get(button.nextNodeId) || button.nextNodeId) : '',
      ])
      buttonCount += 1
    }
  }

  await workbook.xlsx.writeFile(outputPath)
  console.log(`导出完成：${outputPath}`)
  console.log(`事件 ${events.length} / 剧情节点 ${nodes.length} / 按钮 ${buttonCount}`)
} finally {
  await client.close()
}
