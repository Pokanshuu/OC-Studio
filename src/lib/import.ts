import { db } from '@/lib/db'
import type { QueryClient } from '@tanstack/react-query'
import type { Table, EntityTable } from 'dexie'
import { restoreBackupConfig, type BackupConfig, type RestoreConfigReport } from './export/backup-config'
import { remapRowRefs, toRefId, type IdMaps, type RemapKind } from './import-remap'
import {
  BackupPayloadError,
  isNormalizedBackup,
  parseBackupPayload,
  type BackupIssue,
  type BackupRow,
  type BackupTableKey,
} from './import-normalize'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { JOURNAL_REL_PATH, mergeJournalLines, readJournalLines } from '@/lib/vault/journal'

export interface ImportSummary {
  /** The backup itself declares that these sections were not included. */
  incomplete?: string[]
  /** fork 版（version 2）备份里的地图：只统计不导入（锚点在我们的模型里存实体上） */
  maps?: number
  /** 备份里带的设置项（人可读短名）；旧备份没有这段 */
  config?: string[]
  characters: number
  events: number
  countries: number
  worldEntries: number
  tags: number
  periods: number
  /**
   * 规范化时被修正 / 忽略的条目（坏载荷在这里说清楚）。
   *
   * 预览与导入消费的是**同一份**规范化载荷，所以「预览里过滤掉的 null」不会被真正写进库。
   */
  issues?: BackupIssue[]
}

export type MergeStrategy = 'skip' | 'overwrite' | 'keep-both' | 'replace'

/** 一条导入冲突（同名歧义 / 备份内重复）：报出来，不猜目标 */
export interface ImportConflict {
  /** 人可读的表名（角色 / 国家 / 词条 …） */
  table: string
  title: string
  /** 词条的祖先路径（有层级时才有） */
  path?: string
  reason: string
}

export interface ImportResult {
  incomplete?: string[]
  added: number
  skipped: number
  overwritten: number
  /** 设置段的处理结果：恢复了哪几项 / 哪几项因为目标已有设置而保留（含原因与灵感合并报告） */
  config?: RestoreConfigReport
  /** 因为目标不存在（或没导进来）而断开的**成员事实**条数：国籍 / 参与者 / 层级 / references */
  droppedRefs?: number
  /** 正文里被解除跳转（保留 label 文字）的引用节点数 */
  bodyRefsUnlinked?: number
  /** 命名关系里保留原文、只解除 targetId 的条数 */
  namedRefsKept?: number
  /** 同名歧义等冲突（有才出现） */
  conflicts?: ImportConflict[]
  /** 规范化时修正 / 忽略的条目（有才出现） */
  ignored?: BackupIssue[]
  /** 从备份并进本地创作时间线的条数（去重后的增量） */
  journalAdded?: number
}

export interface ImportedRowIdentity {
  table: BackupTableKey | 'meta'
  id: number
}

export interface ImportOptions {
  /** Runs outside the import transaction, only for rows actually inserted/overwritten. */
  afterCommit?: (rows: ImportedRowIdentity[]) => Promise<void>
}

/**
 * 导入是**唯一未校验的外部数据入口**：备份 JSON 来自磁盘上任意文件。
 *
 * 现在校验与规范化收在 `import-normalize.ts`（`parseBackupPayload`）：预检与执行
 * 消费同一份结果，坏载荷在写库之前就变成可读错误 / 忽略清单。这里只保留
 * 「把强类型的表当作任意列的表来写」这层断言（集中在下面两个函数里）。
 */
type LooseTable = Table<Record<string, unknown>, number>

function looseTable<T extends { id: number }>(table: EntityTable<T, 'id'>): LooseTable {
  return table as unknown as LooseTable
}

async function bulkAddRows(table: LooseTable, rows: Record<string, unknown>[]): Promise<number | undefined> {
  const lastKey = await table.bulkAdd(rows)
  return typeof lastKey === 'number' ? lastKey : undefined
}

/* ── 合并 ──────────────────────────────────────────────────────── */

interface NoteNode {
  title: string
  parentId: number | null
}

type NoteIndex = ReadonlyMap<number, NoteNode>

interface TableMergeConfig {
  key: BackupTableKey
  table: LooseTable
  nameField: string
  /** 人可读表名（冲突报告里用） */
  label: string
  /** 引用重映射用的实体种类；标签 / 时期没有引用 */
  kind?: RemapKind
  /** 落库后这张表参与哪一份 id 映射 */
  mapKey?: keyof IdMaps
  /**
   * 同名判定键；不传就按 `nameField` 的文本（角色 / 事件 / 国家 / 标签都是平的）。
   * 分成两份是因为**父级 id 在两边含义不同**：库里是真实 id，备份里是备份内的 id。
   */
  keyOf?: { existing: (row: BackupRow) => string; imported: (row: BackupRow) => string }
  describe: (row: BackupRow) => { title: string; path?: string }
}

interface TableMergeOutcome {
  added: number
  skipped: number
  overwritten: number
  /** 备份里的 id → 落库后的 id（含「同名跳过 → 已有那条」，用来解析引用） */
  idMap: Map<number, number>
  /** 只含**这次真正写进库里**的行（新增 / 覆盖）；引用重映射只碰它们 */
  ownedIdMap: Map<number, number>
  writtenIds: Set<number>
  conflicts: ImportConflict[]
}

function emptyOutcome(): TableMergeOutcome {
  return {
    added: 0,
    skipped: 0,
    overwritten: 0,
    idMap: new Map(),
    ownedIdMap: new Map(),
    writtenIds: new Set(),
    conflicts: [],
  }
}

function createIdMaps(): Record<keyof IdMaps, Map<number, number>> {
  return {
    characters: new Map(),
    countries: new Map(),
    events: new Map(),
    worldEntries: new Map(),
    tags: new Map(),
  }
}

/** 扁平表的名字键：小写 + 去空白；不是字符串就当没有名字（调用方会直接新增） */
function nameKeyOf(row: BackupRow, nameField: string): string {
  const name = row[nameField]
  return typeof name === 'string' ? name.toLowerCase().trim() : ''
}

function titleDescribe(nameField: string): (row: BackupRow) => { title: string } {
  return (row) => {
    const title = row[nameField]
    return { title: typeof title === 'string' ? title : '' }
  }
}

/**
 * 笔记的**完整祖先路径**键：`分类 + 根…父 + 标题`。
 *
 * 只用标题判同名是错的：两本书各有一章「新章节」。只用**直接父标题**也不够 ——
 * 甲卷下有个「共同章节」、乙卷下也有一个，它们下面各有一条「细节」：直接父标题相同，
 * 祖先不同，是两条不同的笔记（审查报告 F07 / R07 就是这么把已有笔记的父级改掉的）。
 *
 * 父级用**标题**而不是 id：备份里的 id 到了目标库就失效了，标题才是跨库稳定的。
 * 祖先链在库里 / 备份里各自走一遍，遇到悬空父级、标题为空或成环就停下（当根处理）。
 */
function notePathTitles(row: BackupRow, index: NoteIndex): string[] {
  const titles: string[] = [typeof row.title === 'string' ? row.title : '']
  const visited = new Set<number>()
  let parentId = toRefId(row.parentId)
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = index.get(parentId)
    const title = parent?.title ?? ''
    if (title.trim() === '') break
    titles.unshift(title)
    parentId = parent?.parentId ?? null
  }
  return titles
}

function notePathKey(row: BackupRow, index: NoteIndex): string {
  const titles = notePathTitles(row, index)
  const self = titles[titles.length - 1] ?? ''
  // 没标题的条目不能当同名键，否则所有空标题条目会互相匹配
  if (self.trim() === '') return ''
  const category = typeof row.category === 'string' ? row.category.trim().toLowerCase() : ''
  const segments = titles.map((title) => title.trim().toLowerCase())
  return `${category}\u0000${segments.join('\u0001')}`
}

function describeNote(row: BackupRow, index: NoteIndex): { title: string; path?: string } {
  const titles = notePathTitles(row, index)
  const title = titles[titles.length - 1] ?? ''
  if (titles.length <= 1) return { title }
  return { title, path: titles.slice(0, -1).join(' / ') }
}

function readNoteIndex(rows: BackupRow[]): Map<number, NoteNode> {
  const index = new Map<number, NoteNode>()
  for (const row of rows) {
    const id = toRefId(row.id)
    if (id === null) continue
    index.set(id, {
      title: typeof row.title === 'string' ? row.title : '',
      parentId: toRefId(row.parentId),
    })
  }
  return index
}

function buildTableConfigs(): TableMergeConfig[] {
  return [
    {
      key: 'characters',
      table: looseTable(db.characters),
      nameField: 'name',
      label: '角色',
      kind: 'character',
      mapKey: 'characters',
      describe: titleDescribe('name'),
    },
    {
      key: 'events',
      table: looseTable(db.events),
      nameField: 'title',
      label: '事件',
      kind: 'event',
      mapKey: 'events',
      describe: titleDescribe('title'),
    },
    {
      key: 'countries',
      table: looseTable(db.countries),
      nameField: 'name',
      label: '国家',
      kind: 'country',
      mapKey: 'countries',
      describe: titleDescribe('name'),
    },
    {
      key: 'worldEntries',
      table: looseTable(db.worldEntries),
      nameField: 'title',
      label: '词条',
      kind: 'worldEntry',
      mapKey: 'worldEntries',
      describe: titleDescribe('title'),
    },
    {
      key: 'tags',
      table: looseTable(db.tags),
      nameField: 'name',
      label: '标签',
      mapKey: 'tags',
      describe: titleDescribe('name'),
    },
    {
      key: 'periods',
      table: looseTable(db.periods),
      nameField: 'name',
      label: '时期',
      describe: titleDescribe('name'),
    },
  ]
}

/**
 * 把一批备份行**新增**进表里，并给出「备份 id → 新 id」。
 *
 * 一律剥掉 `id` 让 Dexie 自增：备份里的编号在目标库没有意义，写进去就是撞号覆盖。
 * 自增主键连续，所以用「最后一个 key − 数量 + 1」反推这一批的起点。
 */
async function addRowsWithIds(table: LooseTable, rows: BackupRow[], writtenIds: Set<number>): Promise<Map<number, number>> {
  const assigned = new Map<number, number>()
  if (rows.length === 0) return assigned

  const payload = rows.map((row) => {
    const { id: _id, ...rest } = row
    void _id
    return rest
  })
  const lastKey = await bulkAddRows(table, payload)
  if (typeof lastKey !== 'number') return assigned

  const firstKey = lastKey - payload.length + 1
  rows.forEach((row, index) => {
    writtenIds.add(firstKey + index)
    const backupId = toRefId(row.id)
    if (backupId === null) return
    assigned.set(backupId, firstKey + index)
  })
  return assigned
}

/**
 * 合并一张表。
 *
 * **skip 的硬约束**：已有行一个字段都不许动（F07）。所以这里只做三件事 —— 新增行、
 * `overwrite` 时替换同名行、把 id 映射记下来给**新增行**解析引用用；
 * 任何「回头把已有行的 parentId 再改一遍」的路径都不再存在。
 *
 * **重复源身份（Q01）**：备份里同一身份键出现多行、且目标库已有同名行时，
 * 只让**最后一行**代表这条身份写库（后写覆盖前写本来就是这个结果），前面的计入
 * `skipped` 并报一次冲突；它们仍会登记「备份 id → 同一条目标 id」，引用不会丢。
 * 不做「目标没有同名行时去重」——那种情况下多行是用户自己的两条同名条目，去重会丢数据。
 */
async function processTableMerge(
  config: TableMergeConfig,
  records: BackupRow[],
  strategy: Exclude<MergeStrategy, 'replace'>,
): Promise<TableMergeOutcome> {
  const outcome = emptyOutcome()
  if (records.length === 0) return outcome

  if (strategy === 'keep-both') {
    const assigned = await addRowsWithIds(config.table, records, outcome.writtenIds)
    for (const [from, to] of assigned) {
      outcome.idMap.set(from, to)
      outcome.ownedIdMap.set(from, to)
    }
    outcome.added = records.length
    return outcome
  }

  const keyOfExisting = config.keyOf?.existing ?? ((row: BackupRow) => nameKeyOf(row, config.nameField))
  const keyOfImported = config.keyOf?.imported ?? ((row: BackupRow) => nameKeyOf(row, config.nameField))

  const existingByKey = new Map<string, BackupRow[]>()
  for (const item of await config.table.toArray()) {
    const key = keyOfExisting(item)
    if (key === '') continue
    const bucket = existingByKey.get(key)
    if (bucket === undefined) existingByKey.set(key, [item])
    else bucket.push(item)
  }

  const keys = records.map((record) => keyOfImported(record))

  // 备份里同一条身份键出现多次：源数据本身有重复。目标库有唯一同名行时，
  // 只有最后一行会写进那条目标（与「后写覆盖前写」一致），前面的行不写。
  const importedCounts = new Map<string, number>()
  const lastMatchedIndex = new Map<string, number>()
  records.forEach((record, index) => {
    const key = keys[index]
    if (key === '') return
    importedCounts.set(key, (importedCounts.get(key) ?? 0) + 1)
    const matches = existingByKey.get(key)
    if (matches === undefined || matches.length !== 1) return
    lastMatchedIndex.set(key, index)
  })
  const duplicateKeysReported = new Set<string>()

  /** 前面那些重复源行：先记下「备份 id → 身份键」，等最后一行算出目标 id 再补映射 */
  const deferred: Array<{ backupId: number | null; key: string }> = []
  /** 身份键 → 这条身份最终落到哪条目标行（skip / overwrite 都有） */
  const targetIdByKey = new Map<string, number>()

  const toAdd: BackupRow[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const key = keys[index]
    const matches = key === '' ? undefined : existingByKey.get(key)
    const backupId = toRefId(record.id)

    if (matches !== undefined && matches.length === 1 && lastMatchedIndex.get(key) !== index) {
      // 备份内重复：不写这一行，只留下它的 id 映射（等最后一行处理完再补）
      outcome.skipped += 1
      deferred.push({ backupId, key })
      continue
    }

    if (matches !== undefined && matches.length > 1) {
      // 真歧义：目标库里有多条同名（同一祖先路径）的条目，无法判断该合并到哪一条。
      // 既不覆盖也不跳过到某一条身上 —— 这一行不导入，并把冲突报出来。
      outcome.conflicts.push({
        ...config.describe(record),
        table: config.label,
        reason: `目标库里有 ${matches.length} 条同名条目，无法判断该合并到哪一条；这一行没有导入`,
      })
      outcome.skipped += 1
      continue
    }

    if (matches !== undefined) {
      const existing = matches[0]
      const existingId = toRefId(existing.id)
      if (existingId !== null) targetIdByKey.set(key, existingId)
      if (strategy === 'overwrite') {
        const { id: _importId, ...importData } = record
        void _importId
        await config.table.put({ ...importData, id: existingId ?? existing.id })
        if (existingId !== null) outcome.writtenIds.add(existingId)
        outcome.overwritten += 1
        if (backupId !== null && existingId !== null) {
          outcome.idMap.set(backupId, existingId)
          outcome.ownedIdMap.set(backupId, existingId)
        }
      } else {
        // 同名跳过：关系仍然应该指到「已有那一条」，所以也记进映射（但不写那一行）
        outcome.skipped += 1
        if (backupId !== null && existingId !== null) outcome.idMap.set(backupId, existingId)
      }

      const duplicates = importedCounts.get(key) ?? 0
      if (duplicates > 1 && !duplicateKeysReported.has(key)) {
        duplicateKeysReported.add(key)
        outcome.conflicts.push({
          ...config.describe(record),
          table: config.label,
          reason: `备份里有 ${duplicates} 条同名条目，只有最后一条会写入目标；其余按重复跳过`,
        })
      }
      continue
    }

    toAdd.push(record)
  }

  // 重复源行的引用映射：它们指的是同一条身份 = 同一个目标
  for (const item of deferred) {
    if (item.backupId === null) continue
    const targetId = targetIdByKey.get(item.key)
    if (targetId !== undefined) outcome.idMap.set(item.backupId, targetId)
  }

  if (toAdd.length > 0) {
    const assigned = await addRowsWithIds(config.table, toAdd, outcome.writtenIds)
    for (const [from, to] of assigned) {
      outcome.idMap.set(from, to)
      outcome.ownedIdMap.set(from, to)
    }
    outcome.added += toAdd.length
  }
  return outcome
}

/** `replace`：清空之后全部按新条目写入（同样要给 id 映射，否则正文 / 层级会指向备份编号） */
async function addTableReplacing(config: TableMergeConfig, records: BackupRow[]): Promise<TableMergeOutcome> {
  const outcome = emptyOutcome()
  if (records.length === 0) return outcome
  const assigned = await addRowsWithIds(config.table, records, outcome.writtenIds)
  for (const [from, to] of assigned) {
    outcome.idMap.set(from, to)
    outcome.ownedIdMap.set(from, to)
  }
  outcome.added = records.length
  return outcome
}

/* ── 导入 ──────────────────────────────────────────────────────── */

const MERGE_STRATEGIES: readonly MergeStrategy[] = ['skip', 'overwrite', 'keep-both', 'replace']

function isMergeStrategy(value: unknown): value is MergeStrategy {
  return typeof value === 'string' && (MERGE_STRATEGIES as readonly string[]).includes(value)
}

/** 备份 `config` 段里各键的人可读名（顺序与备份写入顺序一致） */
const CONFIG_LABELS: Array<[string, string]> = [
  ['categories', '分类'],
  ['fields', '字段表'],
  ['templates', '模板'],
  ['infoGroups', '基本信息组'],
  ['bodyGroups', '正文组'],
  ['folders', '文件夹清单'],
  ['worldFolders', '分类文件夹'],
  ['inspirations', '灵感'],
]

function configLabelsOf(config: unknown): string[] | undefined {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return undefined
  const labels = CONFIG_LABELS.filter(
    ([key]) => (config as Record<string, unknown>)[key] !== undefined,
  ).map(([, label]) => label)
  return labels.length > 0 ? labels : undefined
}

/**
 * 预检：返回给用户看的人工摘要。
 *
 * 与 `importData` 走**同一个** `parseBackupPayload` —— 预览里过滤掉的 null / 脏行，
 * 实际导入时也不会被写进库（F11 / R09 就是「预览按过滤后统计、执行却写原数组」）。
 * 结构错误（版本 / 缺 data / 前置表不是数组）在这里就抛出，一行都不会写。
 */
export function validateImportData(json: unknown): ImportSummary {
  const payload = parseBackupPayload(json)
  return {
    ...(payload.incomplete !== undefined ? { incomplete: payload.incomplete } : {}),
    maps: payload.version === 2 ? payload.maps.length : undefined,
    config: configLabelsOf(payload.config),
    characters: payload.data.characters.length,
    events: payload.data.events.length,
    countries: payload.data.countries.length,
    worldEntries: payload.data.worldEntries.length,
    tags: payload.data.tags.length,
    periods: payload.data.periods.length,
    issues: payload.issues.length > 0 ? payload.issues : undefined,
  }
}

interface RemapStats {
  dropped: number
  namedKept: number
  bodyUnlinked: number
}

/**
 * 只给**这次真正写入的行**（新增 / 覆盖）重映射引用。
 *
 * 被「同名跳过」的已有行不在 `owned` 里 —— 它一个字都不改。
 *
 * **每个目标行只映射一次**（Q01）：多个源行可能映射到同一个目标（`overwrite` 下备份里
 * 有多条同名条目），它们先后 `put` 以后，库里留下的就是**最终源版本**。按源行遍历会
 * 把已经映射过的目标 id（例如 countryId=50）当成备份编号再查一遍映射表，查不到就清成
 * null —— 真正的正常引用就这么丢了。所以这里按**目标 id 去重**，直接读最终行映射一次。
 */
async function remapOwnedRows(
  configs: readonly TableMergeConfig[],
  owned: Record<keyof IdMaps, Map<number, number>>,
  maps: IdMaps,
): Promise<RemapStats> {
  const stats: RemapStats = { dropped: 0, namedKept: 0, bodyUnlinked: 0 }

  for (const config of configs) {
    if (config.kind === undefined || config.mapKey === undefined) continue
    const ownedForTable = owned[config.mapKey]
    if (ownedForTable.size === 0) continue

    // Set 保留插入顺序（源行顺序），统计与日志稳定；重复目标只取第一次
    const targets = new Set<number>(ownedForTable.values())
    for (const newId of targets) {
      const current = await config.table.get(newId)
      if (current === undefined) continue

      const remapped = remapRowRefs(config.kind, current, maps)
      stats.dropped += remapped.dropped
      stats.namedKept += remapped.unresolvedNamed
      stats.bodyUnlinked += remapped.unlinked
      if (remapped.patch !== null) await config.table.update(newId, remapped.patch)
    }
  }

  return stats
}

export async function importData(
  json: unknown,
  strategy: MergeStrategy,
  queryClient?: QueryClient,
  options?: ImportOptions,
): Promise<ImportResult> {
  // 预检与执行消费同一份规范化载荷：直接传规范化结果也不会再解析一遍
  const payload = isNormalizedBackup(json) ? json : parseBackupPayload(json)
  if (!isMergeStrategy(strategy)) {
    throw new BackupPayloadError(`不支持的合并策略：${String(strategy)}`)
  }

  const result = await db.transaction(
    'rw',
    [db.characters, db.events, db.countries, db.worldEntries, db.tags, db.periods, db.meta],
    async () => {
      const configs = buildTableConfigs()
      const maps = createIdMaps()
      const owned = createIdMaps()
      const conflicts: ImportConflict[] = []
      const written: ImportedRowIdentity[] = []
      let added = 0
      let skipped = 0
      let overwritten = 0

      if (strategy === 'replace') {
        await db.characters.clear()
        await db.events.clear()
        await db.countries.clear()
        await db.worldEntries.clear()
        await db.tags.clear()
        await db.periods.clear()
        await db.meta.clear()
      }

      // 词条同名匹配要**完整祖先路径**：库里与备份各建一份 index（replace 时库已清空）
      if (strategy !== 'replace') {
        const worldConfig = configs.find((config) => config.key === 'worldEntries')
        if (worldConfig !== undefined) {
          const existingIndex = readNoteIndex(await looseTable(db.worldEntries).toArray())
          const importedIndex = readNoteIndex(payload.data.worldEntries)
          worldConfig.keyOf = {
            existing: (row) => notePathKey(row, existingIndex),
            imported: (row) => notePathKey(row, importedIndex),
          }
          worldConfig.describe = (row) => describeNote(row, importedIndex)
        }
      }

      for (const config of configs) {
        const records = payload.data[config.key]
        const outcome =
          strategy === 'replace'
            ? await addTableReplacing(config, records)
            : await processTableMerge(config, records, strategy)

        added += outcome.added
        skipped += outcome.skipped
        overwritten += outcome.overwritten
        conflicts.push(...outcome.conflicts)
        for (const id of outcome.writtenIds) written.push({ table: config.key, id })
        if (config.mapKey !== undefined) {
          for (const [from, to] of outcome.idMap) maps[config.mapKey].set(from, to)
          for (const [from, to] of outcome.ownedIdMap) owned[config.mapKey].set(from, to)
        }
      }

      /**
       * 项目元信息是单例（id 固定 1），不能「再加一条」。
       *
       * 它同样受合并策略约束：`skip` / `keep-both` 时目标已有元信息就**保留目标库的**，
       * 不能借「单例」之名绕过 skip 的「已有行不动」。
       */
      const metaRow = payload.data.meta[0]
      if (metaRow !== undefined) {
        const hadMeta = (await db.meta.get(1)) !== undefined
        const shouldWrite = strategy === 'overwrite' || strategy === 'replace' || !hadMeta
        if (shouldWrite) {
          await looseTable(db.meta).put({ ...metaRow, id: 1 })
          written.push({ table: 'meta', id: 1 })
          if (hadMeta) overwritten += 1
          else added += 1
        } else {
          skipped += 1
        }
      }

      const stats = await remapOwnedRows(
        configs,
        owned,
        {
          characters: maps.characters,
          countries: maps.countries,
          events: maps.events,
          worldEntries: maps.worldEntries,
          tags: maps.tags,
        },
      )

      return { added, skipped, overwritten, conflicts, written, ...stats }
    },
  )

  await options?.afterCommit?.(result.written)

  /**
   * 设置段在**数据落库之后**恢复：它写的是 `.ocstudio/` 下的文件（或 localStorage），
   * 不在 Dexie 事务里。目标还没配过时整段恢复，配过就整段保留 —— 规则见 backup-config.ts。
   */
  const config = await restoreBackupConfig(payload.config as BackupConfig | undefined)

  /**
   * 创作时间线：只追加、按条去重（`mergeJournalLines`），同一份备份导两次不会重复。
   * 写失败不能把整次导入判失败 —— 与保存时的口径一致：时间线是证据，不是数据本体。
   */
  let journalAdded = 0
  if (payload.journal.length > 0 && isVaultSupported()) {
    try {
      const existing = await readJournalLines()
      const fresh = mergeJournalLines(existing, payload.journal)
      const session = getVaultSession()
      if (fresh.length > 0 && session !== null) {
        await vaultFs.journalAppend(session.root, JOURNAL_REL_PATH, fresh)
        journalAdded = fresh.length
      }
    } catch (err) {
      console.warn('[import] 时间线合并失败（不影响数据导入）:', err)
    }
  }

  queryClient?.invalidateQueries()

  // 同名歧义不猜目标：冲突清单随结果返回（供界面列出），这里只留一条可查的痕迹
  if (result.conflicts.length > 0) {
    console.warn(`[import] ${result.conflicts.length} 条同名歧义无法判断合并目标，已跳过（详见导入结果）`)
  }

  const resultOut: ImportResult = {
    ...(payload.incomplete !== undefined ? { incomplete: payload.incomplete } : {}),
    added: result.added,
    skipped: result.skipped,
    overwritten: result.overwritten,
    config,
    ...(result.dropped > 0 ? { droppedRefs: result.dropped } : {}),
    ...(result.bodyUnlinked > 0 ? { bodyRefsUnlinked: result.bodyUnlinked } : {}),
    ...(result.namedKept > 0 ? { namedRefsKept: result.namedKept } : {}),
    ...(result.conflicts.length > 0 ? { conflicts: result.conflicts } : {}),
    ...(payload.issues.length > 0 ? { ignored: payload.issues } : {}),
    ...(journalAdded > 0 ? { journalAdded } : {}),
  }
  return resultOut
}
