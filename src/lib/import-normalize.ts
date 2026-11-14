/**
 * `.ocbak` 备份的**解析与规范化**（纯函数，不碰 Dexie、不碰文件系统）。
 *
 * 为什么需要这一层：
 * - 备份 JSON 是**外部输入**（磁盘上的任意文件）。以前预检只做「是对象数组吗」的统计，
 *   然后就把**原始数组**交给导入 —— 预览说「0 角色」，实际写入时却在解构 `null` 时抛
 *   TypeError（审查报告 F11 / R09）。预览与执行必须消费**同一份规范化结果**。
 * - 落库前还有一层引用重映射（`import-remap.ts`），它需要稳定的 id 与数组形态；
 *   脏字段留到那一步才发现，等于把校验散在写入过程中。
 *
 * 这里的约定：
 * - **结构错误**（不是对象 / 版本不认识 / 缺 data / 前置表不是数组）→ 抛
 *   `BackupPayloadError`，导入**一行都不写**，错误文案可直接给用户看；
 * - **行级问题**（null / 基本类型 / 数组元素、重复 id、字段类型不对）→ 记进 `issues`
 *   并就地规范化（丢掉无效元素、补合成 id、把数组归一成数组），**不静默**：预览与
 *   导入结果里都带着这份清单；
 * - **不认识的字段一律保留**（行是浅拷贝，未知键原样带走），扩展字段有迁移价值；
 * - 版本边界保持不变：只认 `version: 1`（本仓库）与 `version: 2`（fork 版，多 `data.maps`），
 *   不擅自发明新格式；`periods` / `meta` / `config` / `journal` 仍然可选。
 */

import { REF_SPECS_BY_TABLE, emptyRowRefSpec, toRefId, type RowRefSpec } from './import-remap'

export type BackupRow = Record<string, unknown>

/** 一条可读的「规范化时发现了什么」记录（预览与导入报告共用） */
export interface BackupIssue {
  /** 位置：`data.characters[3].tags` */
  path: string
  message: string
}

export interface NormalizedBackupData {
  characters: BackupRow[]
  events: BackupRow[]
  countries: BackupRow[]
  worldEntries: BackupRow[]
  tags: BackupRow[]
  periods: BackupRow[]
  /** 项目元信息：单例，规范化为最多一条（id 固定 1） */
  meta: BackupRow[]
  /** 备份里我们不认识的 `data.*`：原样留着，不导入（扩展位） */
  extra: Record<string, unknown>
}

export interface NormalizedBackup {
  version: 1 | 2
  exportedAt?: string
  /** Missing content declared by this export; absent on older backups. */
  incomplete?: string[]
  /** 设置段：原样透传（由 `export/backup-config` 校验与恢复，这里不解释内容） */
  config?: unknown
  /** 创作时间线原始行（只保留字符串） */
  journal: string[]
  /** fork 版备份里的地图：只统计、不导入 */
  maps: BackupRow[]
  data: NormalizedBackupData
  /** 规范化时被修正 / 忽略的条目，给用户看的 */
  issues: BackupIssue[]
}

/** 表键（`meta` 是单例，单独处理） */
export const BACKUP_TABLE_KEYS = [
  'characters',
  'events',
  'countries',
  'worldEntries',
  'tags',
  'periods',
] as const

export type BackupTableKey = (typeof BACKUP_TABLE_KEYS)[number]

/** v1 起就存在的表：缺了就是坏备份（`periods` / `meta` 是后加的，允许缺） */
const REQUIRED_TABLE_KEYS: readonly BackupTableKey[] = [
  'characters',
  'events',
  'countries',
  'worldEntries',
  'tags',
]

const NORMALIZED_MARK = Symbol.for('ocstudio.backup.normalized.v1')

/** 结构化错误：文案直接给用户看（导入界面会把它放进 toast） */
export class BackupPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupPayloadError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 已经规范化过的载荷？（导入可以接受 `parseBackupPayload` 的结果，不必再解析一遍） */
export function isNormalizedBackup(value: unknown): value is NormalizedBackup {
  if (!isPlainObject(value)) return false
  return (value as unknown as Record<symbol, unknown>)[NORMALIZED_MARK] === true
}

/** 一次解析的人工摘要：id → 已经见过的空格，用来发现重复 */
interface RowIdState {
  seen: Set<number>
  /** 无效 id 的合成编号（负数，只活在内存里，写库前一定被剥掉） */
  nextSynthetic: number
}

function createRowIdState(): RowIdState {
  return { seen: new Set(), nextSynthetic: -1 }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '数组'
  return typeof value
}

/**
 * 行 id 归一：能认的 id 保留（数字 / 数字字符串），否则给一个合成负数 id。
 *
 * 为什么要给合成 id：没有 id 的行也要参与「新增行 → 引用重映射」（它被别人引用时，
 * 或者它自己带引用时都要处理）。合成 id 只活在这份规范化载荷里 —— 写库时
 * `bulkAdd` 一律剥掉 `id`，`put` 一律用目标行的 id。
 */
/** 取一个合成负数 id（避开已经出现过的编号；只活在内存里） */
function takeSyntheticId(state: RowIdState): number {
  let id = state.nextSynthetic
  while (state.seen.has(id)) id -= 1
  state.nextSynthetic = id - 1
  state.seen.add(id)
  return id
}

function normalizeRowId(
  row: BackupRow,
  state: RowIdState,
  path: string,
  issues: BackupIssue[],
): void {
  const raw = row.id
  if (raw === undefined) {
    row.id = takeSyntheticId(state)
    issues.push({ path, message: '缺少 id，按新条目导入（无法被备份内其他条目引用）' })
    return
  }
  const id = toRefId(raw)
  // 备份里的编号是 Dexie 自增主键：只可能是正整数
  if (id === null || id <= 0) {
    row.id = takeSyntheticId(state)
    issues.push({ path: `${path}.id`, message: `id 不是有效编号（${describeValue(raw)}），按新条目导入` })
    return
  }
  if (state.seen.has(id)) {
    // 同一张表里 id 重复：第一个占住映射，后面的行按新条目导入（不猜引用指的是哪一条）
    row.id = takeSyntheticId(state)
    issues.push({ path: `${path}.id`, message: `id ${id} 重复，后面的这一条按新条目导入` })
    return
  }
  state.seen.add(id)
  row.id = id
}

/** 名字列：必须是字符串（数字 / 布尔转成文本，其余按空处理并报告） */
function normalizeNameField(row: BackupRow, nameField: string, path: string, issues: BackupIssue[]): void {
  const raw = row[nameField]
  if (typeof raw === 'string') return
  if (raw === undefined) {
    issues.push({ path, message: `缺少 ${nameField}，导入后名称为空` })
    row[nameField] = ''
    return
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    issues.push({ path: `${path}.${nameField}`, message: `${nameField} 不是字符串，已转成文本` })
    row[nameField] = String(raw)
    return
  }
  issues.push({ path: `${path}.${nameField}`, message: `${nameField} 不是文本（${describeValue(raw)}），已清空` })
  row[nameField] = ''
}

const BOOLEAN_FIELDS = ['deleted', 'isMajor', 'isConcept'] as const
const NUMBER_FIELDS = ['createdAt', 'updatedAt', 'order'] as const

function normalizeScalars(row: BackupRow, path: string, issues: BackupIssue[]): void {
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in row)) continue
    const raw = row[field]
    if (typeof raw === 'boolean') continue
    const next = raw === true || raw === 1 || raw === 'true'
    issues.push({ path: `${path}.${field}`, message: `${field} 不是布尔值（${describeValue(raw)}），按 ${String(next)} 处理` })
    row[field] = next
  }
  for (const field of NUMBER_FIELDS) {
    if (!(field in row)) continue
    const raw = row[field]
    if (typeof raw === 'number' && Number.isFinite(raw)) continue
    const parsed = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    if (Number.isFinite(parsed)) {
      row[field] = parsed
      continue
    }
    issues.push({ path: `${path}.${field}`, message: `${field} 不是数字（${describeValue(raw)}），保持原样（排序可能异常）` })
  }
}

/** 引用字段按登记表归一：id 列表 / 单值 id / 关系对象数组；无效内容清掉并报告 */
function normalizeRefFields(row: BackupRow, spec: RowRefSpec, path: string, issues: BackupIssue[]): void {
  for (const { field } of [...spec.singleRefs, ...spec.parentRefs]) {
    if (!(field in row)) continue
    const raw = row[field]
    if (raw === null || raw === undefined) continue
    const id = toRefId(raw)
    if (id === null) {
      issues.push({ path: `${path}.${field}`, message: `${field} 不是有效 id（${describeValue(raw)}），已清空` })
      row[field] = null
      continue
    }
    if (typeof raw !== 'number') row[field] = id
  }

  for (const { field } of spec.idLists) {
    if (!(field in row)) continue
    const raw = row[field]
    if (raw === null || raw === undefined) {
      row[field] = []
      continue
    }
    if (!Array.isArray(raw)) {
      issues.push({ path: `${path}.${field}`, message: `${field} 不是数组（${describeValue(raw)}），已清空` })
      row[field] = []
      continue
    }
    const next: number[] = []
    let invalid = 0
    for (const item of raw) {
      const id = toRefId(item)
      if (id === null) {
        invalid += 1
        continue
      }
      if (!next.includes(id)) next.push(id)
    }
    if (invalid > 0) {
      issues.push({ path: `${path}.${field}`, message: `${field} 里有 ${invalid} 个无效 id，已忽略` })
    }
    row[field] = next
  }

  const objectLists = [...spec.namedLists, ...spec.memberLists, ...spec.typedLists]
  for (const { field } of objectLists) {
    if (!(field in row)) continue
    const raw = row[field]
    if (raw === null || raw === undefined) {
      row[field] = []
      continue
    }
    if (!Array.isArray(raw)) {
      issues.push({ path: `${path}.${field}`, message: `${field} 不是数组（${describeValue(raw)}），已清空` })
      row[field] = []
      continue
    }
    const next = raw.filter((item): item is Record<string, unknown> => isPlainObject(item))
    if (next.length !== raw.length) {
      issues.push({ path: `${path}.${field}`, message: `${field} 里有 ${raw.length - next.length} 项不是对象，已忽略` })
    }
    row[field] = next
  }

  for (const field of spec.bodyFields) {
    if (!(field in row)) continue
    const raw = row[field]
    if (raw === null || raw === undefined) continue
    if (typeof raw === 'string') continue
    if (isPlainObject(raw)) {
      // `document` 本来就是对象；`content` 的声明类型是字符串（老数据是 JSON 字符串）——
      // 把对象塞进 content 会让 `worldBodyOf` / `documentOfEntity` 在读正文时炸掉
      if (field === 'document') continue
      row[field] = JSON.stringify(raw)
      issues.push({ path: `${path}.${field}`, message: `${field} 不是字符串，已转成 JSON 文本` })
      continue
    }
    issues.push({ path: `${path}.${field}`, message: `${field} 不是文档对象（${describeValue(raw)}），已忽略` })
    delete row[field]
  }
}

function normalizeRow(raw: unknown, spec: RowRefSpec, path: string, state: RowIdState, issues: BackupIssue[]): BackupRow | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `不是对象（${describeValue(raw)}），已忽略` })
    return null
  }
  // 浅拷贝：未知扩展字段原样保留
  const row: BackupRow = { ...raw }
  normalizeRowId(row, state, path, issues)
  normalizeNameField(row, spec.nameField, path, issues)
  normalizeScalars(row, path, issues)
  normalizeRefFields(row, spec, path, issues)
  return row
}

function normalizeTable(
  key: string,
  raw: unknown,
  issues: BackupIssue[],
): BackupRow[] {
  if (!Array.isArray(raw)) {
    issues.push({ path: `data.${key}`, message: `不是数组（${describeValue(raw)}），按空表处理` })
    return []
  }
  const spec = REF_SPECS_BY_TABLE[key] ?? emptyRowRefSpec('name')
  const state = createRowIdState()
  const rows: BackupRow[] = []
  raw.forEach((item, index) => {
    const row = normalizeRow(item, spec, `data.${key}[${index}]`, state, issues)
    if (row !== null) rows.push(row)
  })
  return rows
}

/** 只挑对象元素（统计用，不落库） */
function objectRowsOnly(raw: unknown, path: string, issues: BackupIssue[]): BackupRow[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `不是数组（${describeValue(raw)}），已忽略` })
    return []
  }
  const rows = raw.filter((item): item is BackupRow => isPlainObject(item))
  if (rows.length !== raw.length) {
    issues.push({ path, message: `有 ${raw.length - rows.length} 项不是对象，已忽略` })
  }
  return rows
}

/** 单例元信息：最多一条，id 固定 1（否则 `put` 会造出第二条 project meta） */
function normalizeMeta(raw: unknown, issues: BackupIssue[]): BackupRow[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push({ path: 'data.meta', message: `不是数组（${describeValue(raw)}），已忽略` })
    return []
  }
  const rows: BackupRow[] = []
  raw.forEach((item, index) => {
    if (!isPlainObject(item)) {
      issues.push({ path: `data.meta[${index}]`, message: `不是对象（${describeValue(item)}），已忽略` })
      return
    }
    rows.push({ ...item, id: 1 })
  })
  if (rows.length > 1) {
    issues.push({ path: 'data.meta', message: `备份里有 ${rows.length} 条元信息，只取第一条（项目元信息是单例）` })
  }
  return rows.slice(0, 1)
}

function normalizeJournal(raw: unknown, issues: BackupIssue[]): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    issues.push({ path: 'journal', message: `不是数组（${describeValue(raw)}），已忽略` })
    return []
  }
  const lines = raw.filter((item): item is string => typeof item === 'string')
  if (lines.length !== raw.length) {
    issues.push({ path: 'journal', message: `有 ${raw.length - lines.length} 条不是文本，已忽略` })
  }
  return lines
}

function normalizeConfig(raw: unknown, issues: BackupIssue[]): unknown {
  if (raw === undefined || raw === null) return undefined
  if (!isPlainObject(raw)) {
    issues.push({ path: 'config', message: `不是对象（${describeValue(raw)}），已忽略` })
    return undefined
  }
  return raw
}

/**
 * 解析 + 规范化备份载荷。
 *
 * **唯一入口**：预检（`validateImportData`）与导入（`importData`）都调它，
 * 于是「预览里过滤掉的 null」不会被真正写进库，反之亦然。
 *
 * @throws BackupPayloadError 结构错误 / 版本不认识（此时库一行都没动）
 */
export function parseBackupPayload(json: unknown): NormalizedBackup {
  if (json === null || json === undefined || typeof json !== 'object') {
    throw new BackupPayloadError('无效的数据格式：数据不是 JSON 对象')
  }
  if (isNormalizedBackup(json)) return json

  const payload = json as Record<string, unknown>

  // version 1 = 我们自己的备份；version 2 = fork 版（多了 data.maps，其余结构一致）
  const version = payload.version
  if (version !== 1 && version !== 2) {
    throw new BackupPayloadError(`不支持的版本：${String(version)}，仅支持 version 1 / 2`)
  }

  const data = payload.data
  if (!isPlainObject(data)) {
    throw new BackupPayloadError('缺少 data 字段')
  }

  for (const key of REQUIRED_TABLE_KEYS) {
    if (!Array.isArray(data[key])) {
      throw new BackupPayloadError(`缺少 data.${key} 数组`)
    }
  }

  const issues: BackupIssue[] = []
  const normalized: NormalizedBackupData = {
    characters: normalizeTable('characters', data.characters, issues),
    events: normalizeTable('events', data.events, issues),
    countries: normalizeTable('countries', data.countries, issues),
    worldEntries: normalizeTable('worldEntries', data.worldEntries, issues),
    tags: normalizeTable('tags', data.tags, issues),
    // periods 为 v1 后期新增字段，旧备份可能缺失，向后兼容按 0 处理
    periods: data.periods === undefined ? [] : normalizeTable('periods', data.periods, issues),
    meta: normalizeMeta(data.meta, issues),
    extra: {},
  }

  const knownDataKeys = new Set<string>([...BACKUP_TABLE_KEYS, 'meta', 'maps'])
  for (const [key, value] of Object.entries(data)) {
    if (!knownDataKeys.has(key)) normalized.extra[key] = value
  }

  // fork 版的地图只统计不导入：只过滤出对象元素，不做字段规范化（它们没有对应表）
  const maps = data.maps === undefined ? [] : objectRowsOnly(data.maps, 'data.maps', issues)

  const result: NormalizedBackup = {
    version,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined,
    ...(isPlainObject(payload.manifest) && payload.manifest.complete === false
      ? { incomplete: incompleteLabels(payload.manifest.unavailable) }
      : {}),
    config: normalizeConfig(payload.config, issues),
    journal: normalizeJournal(payload.journal, issues),
    maps,
    data: normalized,
    issues,
  }

  // 非枚举标记：`JSON.stringify` 不会把它带进备份（免得污染下一次导出）
  Object.defineProperty(result, NORMALIZED_MARK, { value: true, enumerable: false })
  return result
}

function incompleteLabels(unavailable: unknown): string[] {
  const labels = Array.isArray(unavailable)
    ? unavailable.flatMap((item: unknown) =>
        isPlainObject(item) && typeof item.label === 'string' && item.label.trim() !== ''
          ? [item.label.trim()]
          : [],
      )
    : []
  return labels.length > 0 ? [...new Set(labels)] : ['部分内容（原备份未列明）']
}
