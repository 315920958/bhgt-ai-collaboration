import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

export const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
export const collaborationRoot = path.resolve(scriptsDir, '..')
export const defaultInput = path.join(collaborationRoot, '剧情配置', '事件与节点配置表.xlsx')
export const defaultExport = path.join(collaborationRoot, '剧情配置', '数据库导出_事件与节点.xlsx')
export const imageRoot = path.join(collaborationRoot, '图片')
export const imageExtensions = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.heic', '.avif',
])

const hasCjk = /[一-鿿]/

export function parseArgs(argv) {
  const result = { flags: new Set(), values: {} }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const equalAt = arg.indexOf('=')
    if (equalAt > 2) {
      result.values[arg.slice(2, equalAt)] = arg.slice(equalAt + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      result.values[key] = next
      index += 1
    } else {
      result.flags.add(key)
    }
  }
  return result
}

export function text(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value.text !== undefined) return String(value.text).trim()
  if (typeof value === 'object' && value.result !== undefined) return String(value.result).trim()
  return String(value).trim()
}

export function toOssSegment(segment) {
  const extension = path.extname(segment).toLowerCase()
  const base = path.basename(segment, path.extname(segment))
  if (!hasCjk.test(base)) return segment
  let value = pinyin(base, { toneType: 'none', nonZh: 'consecutive' })
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_-]/g, '')
  if (!value) value = createHash('sha1').update(base).digest('hex').slice(0, 12)
  return value + extension
}

export function toOssPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/').replace(/^\/+/, '')
  return '/' + normalized.split('/').map(toOssSegment).join('/')
}

export function buildImageIndex() {
  const byFileName = new Map()
  const byRelativePath = new Map()
  const byOssPath = new Map()

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) continue
      const relativePath = path.relative(imageRoot, fullPath).split(path.sep).join('/')
      const ossPath = toOssPath(relativePath)
      // Excel 面向编写者，永远保存中文的本地相对路径；数据库才保存 OSS 拼音路径。
      const excelPath = '/' + relativePath
      const item = { fullPath, relativePath, excelPath, ossPath }
      const sameName = byFileName.get(entry.name) || []
      sameName.push(item)
      byFileName.set(entry.name, sameName)
      byRelativePath.set('/' + relativePath, item)
      byRelativePath.set(relativePath, item)
      byOssPath.set(ossPath, item)
    }
  }

  if (!fs.existsSync(imageRoot)) throw new Error(`图片总目录不存在：${imageRoot}`)
  walk(imageRoot)
  return { byFileName, byRelativePath, byOssPath }
}

export function resolveImageValue(rawValue, imageIndex) {
  const raw = text(rawValue)
  if (!raw) return { value: '', ok: true, changed: false }
  const byOssPath = imageIndex.byOssPath.get(raw)
  if (byOssPath) return { value: byOssPath.excelPath, ok: true, changed: raw !== byOssPath.excelPath }

  const byPath = imageIndex.byRelativePath.get(raw)
  if (byPath) return { value: byPath.excelPath, ok: true, changed: raw !== byPath.excelPath }

  const matches = imageIndex.byFileName.get(path.basename(raw)) || []
  if (matches.length === 1) {
    return { value: matches[0].excelPath, ok: true, changed: raw !== matches[0].excelPath }
  }
  if (matches.length > 1) {
    return { value: raw, ok: false, changed: false, reason: `图片文件名不唯一，共匹配 ${matches.length} 个文件` }
  }
  return { value: raw, ok: false, changed: false, reason: '图片总目录中未找到精确匹配' }
}

/** 把已校验的 Excel 中文相对路径转换为数据库使用的 OSS 拼音路径。 */
export function toDatabaseImagePath(excelPath, imageIndex) {
  const raw = text(excelPath)
  if (!raw) return ''
  const item = imageIndex.byRelativePath.get(raw) || imageIndex.byOssPath.get(raw)
  return item ? item.ossPath : toOssPath(raw)
}

/** 数据库 OSS 拼音路径反查为 Excel 使用的中文相对路径；未知值原样保留。 */
export function toExcelImagePath(databasePath, imageIndex) {
  const raw = text(databasePath)
  if (!raw) return ''
  return imageIndex.byOssPath.get(raw)?.excelPath || imageIndex.byRelativePath.get(raw)?.excelPath || raw
}

export function normalizeEventCode(value, fallbackIndex) {
  const raw = text(value)
  if (!raw) return `nb_${fallbackIndex}`
  return raw
}

export function boolFromExcel(value) {
  if (typeof value === 'boolean') return value
  const raw = text(value).toLowerCase()
  if (['是', 'true', '1', 'yes', 'y'].includes(raw)) return true
  if (['否', 'false', '0', 'no', 'n'].includes(raw)) return false
  return undefined
}

export function numberFromExcel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(text(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function headersOf(worksheet) {
  const map = new Map()
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const header = text(worksheet.getCell(1, column).value)
    if (header) map.set(header, column)
  }
  return map
}

export function firstHeader(headers, names) {
  for (const name of names) {
    if (headers.has(name)) return { name, column: headers.get(name) }
  }
  return null
}

export function styleHeader(worksheet, columnCount) {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = worksheet.getCell(1, column)
    cell.font = { ...cell.font, bold: true, color: { argb: 'FF1C1B18' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0D0' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }
  worksheet.getRow(1).height = 28
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
}

export function markCellError(cell) {
  cell.font = { ...cell.font, color: { argb: 'FFFF0000' } }
}

export function clearCellError(cell) {
  if (cell.font?.color?.argb === 'FFFF0000') {
    cell.font = { ...cell.font, color: { argb: 'FF000000' } }
  }
}
