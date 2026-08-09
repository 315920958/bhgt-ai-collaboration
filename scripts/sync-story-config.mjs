#!/usr/bin/env node
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ExcelJS from 'exceljs'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import {
  scriptsDir,
  collaborationRoot,
  defaultInput,
  parseArgs,
  text,
  buildImageIndex,
  resolveImageValue,
  toDatabaseImagePath,
  normalizeEventCode,
  boolFromExcel,
  numberFromExcel,
  headersOf,
  firstHeader,
  markCellError,
  clearCellError,
  styleHeader,
} from './story-config-utils.mjs'

const HELP = `
剧情配置 Excel 校验 / 数据库同步

用法：
  node sync-story-config.mjs --check
  node sync-story-config.mjs --upload-images --check
  node sync-story-config.mjs --sync-db
  node sync-story-config.mjs --upload-images --sync-db

参数：
  --input <xlsx>       输入文件（默认：剧情配置/事件与节点配置表.xlsx）
  --upload-images      最先调用 upload-images-to-oss.mjs
  --check              校验并将图片路径/错误红字写回 Excel
  --sync-db            自动先上传图片并 check，通过后 upsert 到 bhgt_test
  --mongo-uri <uri>    默认 mongodb://127.0.0.1:47017
  --db-name <name>     默认 bhgt_test
`

const args = parseArgs(process.argv.slice(2))
const shouldSync = args.flags.has('sync-db')
const shouldUpload = args.flags.has('upload-images') || shouldSync
const shouldCheck = args.flags.has('check') || shouldSync

if (!shouldUpload && !shouldCheck) {
  console.log(HELP.trim())
  process.exit(0)
}

dotenv.config({ path: path.join(scriptsDir, '.env') })
dotenv.config({ path: path.resolve(collaborationRoot, '..', 'bhgt-server', '.env.development') })

const inputPath = path.resolve(args.values.input || defaultInput)
const mongoUri = args.values['mongo-uri'] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:47017'
const dbName = args.values['db-name'] || process.env.DB_NAME || 'bhgt_test'

if (shouldUpload) {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, 'upload-images-to-oss.mjs')], {
    cwd: scriptsDir,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status || 1)
}

function requiredSheet(workbook, name) {
  const worksheet = workbook.getWorksheet(name)
  if (!worksheet) throw new Error(`缺少 Sheet：${name}`)
  return worksheet
}

function cellValue(worksheet, row, headers, name) {
  const column = headers.get(name)
  return column ? worksheet.getCell(row, column).value : undefined
}

function isBlankRow(worksheet, row) {
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    if (text(worksheet.getCell(row, column).value)) return false
  }
  return true
}

function assertHeaders(sheetName, headers, required, errors) {
  for (const header of required) {
    if (!headers.has(header)) errors.push({ sheet: sheetName, row: 1, column: 1, message: `缺少表头「${header}」` })
  }
}

async function checkWorkbook(db) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(inputPath)
  const eventSheet = requiredSheet(workbook, '事件')
  const nodeSheet = requiredSheet(workbook, '剧情节点')
  const buttonSheet = requiredSheet(workbook, '按钮')
  const eventHeaders = headersOf(eventSheet)
  const nodeHeaders = headersOf(nodeSheet)
  const buttonHeaders = headersOf(buttonSheet)
  const errors = []
  const warnings = []
  const imageIndex = buildImageIndex()

  assertHeaders('事件', eventHeaders, ['中文名', 'ID', '所属阶段'], errors)
  assertHeaders('剧情节点', nodeHeaders, ['节点名称', '所属阶段', '所属事件', '剧情标题'], errors)
  assertHeaders('按钮', buttonHeaders, ['关联节点中文名', '序号', '文案', '类型', '必现', '权重', '目标中文名'], errors)
  const nodeSubHeader = firstHeader(nodeHeaders, ['节点子编号', '节点ID'])
  if (!nodeSubHeader) errors.push({ sheet: '剧情节点', row: 1, column: 1, message: '缺少「节点子编号」列（兼容旧表头「节点ID」）' })

  const sheetByName = new Map([
    ['事件', eventSheet], ['剧情节点', nodeSheet], ['按钮', buttonSheet],
  ])
  function addError(sheet, row, column, message) {
    const item = { sheet, row, column: column || 1, message }
    errors.push(item)
    markCellError(sheetByName.get(sheet).getCell(row, column || 1))
  }

  // 图片：所有表头含“图”的列。成功时补全为中文相对路径；失败保留并标红。
  for (const worksheet of [eventSheet, nodeSheet, buttonSheet]) {
    const headers = headersOf(worksheet)
    const imageColumns = [...headers.entries()].filter(([header]) => header.includes('图'))
    for (let row = 2; row <= worksheet.rowCount; row += 1) {
      if (isBlankRow(worksheet, row)) continue
      for (const [, column] of imageColumns) {
        const cell = worksheet.getCell(row, column)
        const resolved = resolveImageValue(cell.value, imageIndex)
        if (!resolved.ok) {
          addError(worksheet.name, row, column, `${resolved.reason}：${text(cell.value)}`)
        } else {
          if (resolved.changed) cell.value = resolved.value
          clearCellError(cell)
        }
      }
    }
  }

  const stages = await db.collection('config.stages').find({}, { projection: { code: 1, name: 1 } }).toArray()
  const stagesByName = new Map()
  for (const stage of stages) {
    const list = stagesByName.get(stage.name) || []
    list.push(stage)
    stagesByName.set(stage.name, list)
  }
  function resolveStage(sheet, row, column, value) {
    const name = text(value)
    const matches = stagesByName.get(name) || []
    if (matches.length !== 1) {
      addError(sheet, row, column, matches.length ? `大阶段名称不唯一：${name}` : `大阶段不存在：${name}`)
      return null
    }
    clearCellError(sheetByName.get(sheet).getCell(row, column))
    return matches[0]
  }

  const events = []
  const eventByName = new Map()
  const allNames = new Map()
  const eventNameColumn = eventHeaders.get('中文名') || 1
  const eventIdColumn = eventHeaders.get('ID') || 2
  const eventStageColumn = eventHeaders.get('所属阶段') || 3
  const eventDescriptionColumn = eventHeaders.get('描述')
  const eventImageColumn = [...eventHeaders.entries()].find(([header]) => header.includes('图'))?.[1]

  let eventIndex = 0
  for (let row = 2; row <= eventSheet.rowCount; row += 1) {
    if (isBlankRow(eventSheet, row)) continue
    eventIndex += 1
    const name = text(eventSheet.getCell(row, eventNameColumn).value)
    if (!name) addError('事件', row, eventNameColumn, '事件中文名不能为空')
    const code = normalizeEventCode(eventSheet.getCell(row, eventIdColumn).value, eventIndex)
    eventSheet.getCell(row, eventIdColumn).value = code
    const stage = resolveStage('事件', row, eventStageColumn, eventSheet.getCell(row, eventStageColumn).value)
    if (allNames.has(name)) addError('事件', row, eventNameColumn, `中文名重复：${name}`)
    else if (name) allNames.set(name, { type: 'event', row })
    const event = {
      row, code, name, stage,
      description: eventDescriptionColumn ? text(eventSheet.getCell(row, eventDescriptionColumn).value) : '',
      imageUrl: eventImageColumn ? text(eventSheet.getCell(row, eventImageColumn).value) : '',
    }
    events.push(event)
    if (name && !eventByName.has(name)) eventByName.set(name, event)
  }
  const duplicateEventCodes = new Map()
  for (const event of events) {
    const previous = duplicateEventCodes.get(event.code)
    if (previous) addError('事件', event.row, eventIdColumn, `事件编号重复：${event.code}`)
    else duplicateEventCodes.set(event.code, event.row)
  }

  const nodes = []
  const nodeByName = new Map()
  const subCounterByEvent = new Map()
  const nodeNameColumn = nodeHeaders.get('节点名称') || 2
  const nodeStageColumn = nodeHeaders.get('所属阶段') || 3
  const nodeEventColumn = nodeHeaders.get('所属事件') || 4
  const nodeTitleColumn = nodeHeaders.get('剧情标题') || 5
  const nodeTextColumn = nodeHeaders.get('剧情正文')
  const nodeImageColumn = [...nodeHeaders.entries()].find(([header]) => header.includes('图'))?.[1]
  const buttonCountColumn = nodeHeaders.get('显示按钮数')
  const battleColumn = nodeHeaders.get('战斗节点')
  const shopColumn = nodeHeaders.get('通过后开商店')

  for (let row = 2; row <= nodeSheet.rowCount; row += 1) {
    if (isBlankRow(nodeSheet, row)) continue
    const name = text(nodeSheet.getCell(row, nodeNameColumn).value)
    const eventName = text(nodeSheet.getCell(row, nodeEventColumn).value)
    const event = eventByName.get(eventName)
    if (!name) addError('剧情节点', row, nodeNameColumn, '节点名称不能为空')
    if (allNames.has(name)) addError('剧情节点', row, nodeNameColumn, `中文名重复：${name}`)
    else if (name) allNames.set(name, { type: 'node', row })
    if (!event) addError('剧情节点', row, nodeEventColumn, `所属事件不存在：${eventName}`)

    const counterKey = event?.code || eventName || '__missing__'
    const nextCounter = (subCounterByEvent.get(counterKey) || 0) + 1
    subCounterByEvent.set(counterKey, nextCounter)
    let nodeSubCode = nodeSubHeader ? text(nodeSheet.getCell(row, nodeSubHeader.column).value) : ''
    if (!nodeSubCode) {
      nodeSubCode = String(nextCounter)
      if (nodeSubHeader) nodeSheet.getCell(row, nodeSubHeader.column).value = nodeSubCode
    }
    const code = event ? `${event.code}_${nodeSubCode}` : ''
    const stage = resolveStage('剧情节点', row, nodeStageColumn, nodeSheet.getCell(row, nodeStageColumn).value)
    if (event?.stage && stage && !event.stage._id.equals(stage._id)) {
      addError('剧情节点', row, nodeStageColumn, `节点阶段与所属事件阶段不一致：${eventName}`)
    }

    const isBattle = battleColumn ? boolFromExcel(nodeSheet.getCell(row, battleColumn).value) : false
    const opensShop = shopColumn ? boolFromExcel(nodeSheet.getCell(row, shopColumn).value) : false
    const buttonCount = buttonCountColumn ? numberFromExcel(nodeSheet.getCell(row, buttonCountColumn).value) : 3
    if (battleColumn && isBattle === undefined) addError('剧情节点', row, battleColumn, '战斗节点只能填写“是/否”')
    if (shopColumn && opensShop === undefined) addError('剧情节点', row, shopColumn, '通过后开商店只能填写“是/否”')
    if (buttonCountColumn && (!Number.isInteger(buttonCount) || buttonCount < 0)) addError('剧情节点', row, buttonCountColumn, '显示按钮数必须是非负整数')

    const node = {
      row, code, nodeSubCode, name, eventName, event, stage,
      title: text(nodeSheet.getCell(row, nodeTitleColumn).value),
      text: nodeTextColumn ? text(nodeSheet.getCell(row, nodeTextColumn).value) : '',
      imageUrl: nodeImageColumn ? text(nodeSheet.getCell(row, nodeImageColumn).value) : '',
      buttonCount: Number.isInteger(buttonCount) ? buttonCount : 3,
      isBattle: isBattle ?? false,
      afterCompletionOpenShop: opensShop ?? false,
      buttons: [],
    }
    if (!node.title) addError('剧情节点', row, nodeTitleColumn, '剧情标题不能为空')
    nodes.push(node)
    if (name && !nodeByName.has(name)) nodeByName.set(name, node)
  }
  const nodeCodes = new Map()
  for (const node of nodes) {
    if (!node.code) continue
    if (nodeCodes.has(node.code)) addError('剧情节点', node.row, nodeSubHeader?.column || 1, `节点完整编号重复：${node.code}`)
    else nodeCodes.set(node.code, node.row)
  }

  const buttonNodeColumn = buttonHeaders.get('关联节点中文名') || 1
  const buttonSequenceColumn = buttonHeaders.get('序号') || 2
  const buttonTextColumn = buttonHeaders.get('文案') || 3
  const buttonTypeColumn = buttonHeaders.get('类型') || 4
  const buttonRequiredColumn = buttonHeaders.get('必现') || 5
  const buttonWeightColumn = buttonHeaders.get('权重') || 6
  const buttonTargetColumn = buttonHeaders.get('目标中文名') || 7
  const buttonKeys = new Set()
  for (let row = 2; row <= buttonSheet.rowCount; row += 1) {
    if (isBlankRow(buttonSheet, row)) continue
    const nodeName = text(buttonSheet.getCell(row, buttonNodeColumn).value)
    const node = nodeByName.get(nodeName)
    const sequence = numberFromExcel(buttonSheet.getCell(row, buttonSequenceColumn).value)
    const label = text(buttonSheet.getCell(row, buttonTextColumn).value)
    const type = text(buttonSheet.getCell(row, buttonTypeColumn).value) || 'normal'
    const required = boolFromExcel(buttonSheet.getCell(row, buttonRequiredColumn).value)
    const weight = numberFromExcel(buttonSheet.getCell(row, buttonWeightColumn).value)
    const targetName = text(buttonSheet.getCell(row, buttonTargetColumn).value)
    const target = targetName ? nodeByName.get(targetName) : null
    if (!node) addError('按钮', row, buttonNodeColumn, `关联节点不存在：${nodeName}`)
    if (!Number.isInteger(sequence) || sequence < 1) addError('按钮', row, buttonSequenceColumn, '序号必须是大于 0 的整数')
    if (!label) addError('按钮', row, buttonTextColumn, '按钮文案不能为空')
    if (!['normal', 'minigame'].includes(type)) addError('按钮', row, buttonTypeColumn, '按钮类型只能是 normal/minigame')
    if (required === undefined) addError('按钮', row, buttonRequiredColumn, '必现只能填写“是/否”')
    if (weight === undefined || weight < 0) addError('按钮', row, buttonWeightColumn, '权重必须是非负数')
    if (targetName && !target) addError('按钮', row, buttonTargetColumn, `目标节点不存在：${targetName}`)
    const uniqueKey = `${nodeName}\0${sequence}`
    if (buttonKeys.has(uniqueKey)) addError('按钮', row, buttonSequenceColumn, `同一节点的按钮序号重复：${sequence}`)
    else buttonKeys.add(uniqueKey)
    if (node && Number.isInteger(sequence)) {
      node.buttons.push({
        code: `b_${node.code}_${sequence}`,
        text: label,
        type,
        isRequired: required ?? false,
        weight: weight ?? 0,
        nextNodeId: target?.code || '',
        isOneTime: false,
        afterUse: 'hide',
        conditions: {},
        costs: {},
        effects: {},
      })
    }
  }
  for (const node of nodes) node.buttons.sort((a, b) => Number(a.code.split('_').at(-1)) - Number(b.code.split('_').at(-1)))

  const oldValidation = workbook.getWorksheet('校验')
  if (oldValidation) workbook.removeWorksheet(oldValidation.id)
  const validation = workbook.addWorksheet('校验')
  validation.columns = [
    { header: '级别', width: 10 },
    { header: 'Sheet', width: 14 },
    { header: '单元格', width: 12 },
    { header: '信息', width: 80 },
  ]
  styleHeader(validation, 4)
  if (!errors.length && !warnings.length) validation.addRow(['OK', '', '', '全部校验通过，可同步数据库'])
  for (const error of errors) validation.addRow(['ERROR', error.sheet, `${error.row}:${error.column}`, error.message])
  for (const warning of warnings) validation.addRow(['WARN', warning.sheet, `${warning.row}:${warning.column}`, warning.message])
  await workbook.xlsx.writeFile(inputPath)

  return { errors, warnings, events, nodes, imageIndex }
}

async function syncDatabase(db, parsed) {
  const eventCollection = db.collection('config.nodeBundles')
  const nodeCollection = db.collection('config.nodes')
  await Promise.all([
    eventCollection.createIndex({ code: 1 }, { unique: true }),
    nodeCollection.createIndex({ code: 1 }, { unique: true }),
    nodeCollection.createIndex({ nodeBundleCode: 1 }),
    nodeCollection.createIndex(
      { nodeBundleCode: 1, nodeSubCode: 1 },
      {
        unique: true,
        sparse: true,
      },
    ),
    nodeCollection.createIndex({ 'buttons.nextNodeId': 1 }),
  ])
  if (parsed.events.length) {
    const existingEvents = await eventCollection.find({
      $or: [
        { code: { $in: parsed.events.map((event) => event.code) } },
        { name: { $in: parsed.events.map((event) => event.name) } },
      ],
    }).toArray()
    const eventByCode = new Map(existingEvents.map((event) => [event.code, event]))
    const eventByName = new Map(existingEvents.map((event) => [event.name, event]))
    await eventCollection.bulkWrite(parsed.events.map((event) => {
      const existing = eventByCode.get(event.code) || eventByName.get(event.name)
      return {
        updateOne: {
          filter: existing ? { _id: existing._id } : { code: event.code },
          update: {
            $set: {
              code: event.code,
              name: event.name,
              stageId: event.stage._id,
              description: event.description,
            imageUrl: toDatabaseImagePath(event.imageUrl, parsed.imageIndex),
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      }
    }))
  }
  if (parsed.nodes.length) {
    const existingNodes = await nodeCollection.find({
      $or: [
        { code: { $in: parsed.nodes.map((node) => node.code) } },
        { name: { $in: parsed.nodes.map((node) => node.name) } },
      ],
    }).toArray()
    const nodeByCode = new Map(existingNodes.map((node) => [node.code, node]))
    const nodeByName = new Map(existingNodes.map((node) => [node.name, node]))
    await nodeCollection.bulkWrite(parsed.nodes.map((node) => {
      const existing = nodeByCode.get(node.code) || nodeByName.get(node.name)
      return {
        updateOne: {
          filter: existing ? { _id: existing._id } : { code: node.code },
          update: {
            $set: {
              code: node.code,
              nodeSubCode: node.nodeSubCode,
              name: node.name,
              stageId: node.event.stage._id,
              nodeBundleCode: node.event.code,
              title: node.title,
              text: node.text,
            imageUrl: toDatabaseImagePath(node.imageUrl, parsed.imageIndex),
              isBattle: node.isBattle,
              buttonCount: node.buttonCount,
              afterCompletionOpenShop: node.afterCompletionOpenShop,
              buttons: node.buttons,
              updatedAt: new Date(),
            },
            $setOnInsert: { battleConfig: null, createdAt: new Date() },
          },
          upsert: true,
        },
      }
    }))
  }
}

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 })
try {
  await client.connect()
  const db = client.db(dbName)
  const parsed = await checkWorkbook(db)
  console.log(`校验完成：${parsed.errors.length} 错误 / ${parsed.warnings.length} 警告`)
  console.log(`Excel 已更新：${inputPath}`)
  if (parsed.errors.length) {
    console.error('校验未通过，未写入数据库。请查看红色单元格和“校验”Sheet。')
    process.exitCode = 1
  } else if (shouldSync) {
    await syncDatabase(db, parsed)
    console.log(`数据库同步完成：${dbName}（事件 ${parsed.events.length} / 节点 ${parsed.nodes.length}）`)
  }
} finally {
  await client.close()
}
