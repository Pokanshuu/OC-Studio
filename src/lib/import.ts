import { db } from '@/lib/db'
import type { QueryClient } from '@tanstack/react-query'
import type { Table, EntityTable } from 'dexie'
import { restoreBackupConfig, type BackupConfig } from './export/backup-config'

interface ImportPayload {
  version: 1
  exportedAt: string
  /** 设置段；旧备份没有 */
  config?: BackupConfig
  data: {
    characters: Record<string, unknown>[]
    events: Record<string, unknown>[]
    countries: Record<string, unknown>[]
    worldEntries: Record<string, unknown>[]
    tags: Record<string, unknown>[]
    periods?: Record<string, unknown>[]
    meta?: Record<string, unknown>[]
  }
}

export interface ImportSummary {
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
}

export type MergeStrategy = 'skip' | 'overwrite' | 'keep-both' | 'replace'

export interface ImportResult {
  added: number
  skipped: number
  overwritten: number
  /** 设置段的处理结果：恢复了哪几项 / 哪几项因为目标已有设置而保留 */
  config?: { restored: string[]; kept: string[] }
}

const TABLE_CONFIG: Array<{
  key: keyof ImportPayload['data']
  table: LooseTable
  nameField: string
}> = [
  { key: 'characters', table: looseTable(db.characters), nameField: 'name' },
  { key: 'events', table: looseTable(db.events), nameField: 'title' },
  { key: 'countries', table: looseTable(db.countries), nameField: 'name' },
  { key: 'worldEntries', table: looseTable(db.worldEntries), nameField: 'title' },
  { key: 'tags', table: looseTable(db.tags), nameField: 'name' },
  { key: 'periods', table: looseTable(db.periods), nameField: 'name' },
]

/**
 * 导入是**唯一未校验的外部数据入口**：备份 JSON 来自磁盘上任意文件，
 * 只保证「是对象数组」，不做字段级校验（字段完整性由 merge 去重策略与
 * 各实体自身的读取容错承担）。
 *
 * 因此这里需要把强类型的表当作「任意列」的表来写。断言只集中在下面两个函数里，
 * 不再像以前那样在配置里散 6 处 `as unknown as`、在调用点散 10 处 `as never[]`。
 */
type LooseTable = Table<Record<string, unknown>, number>

function looseTable<T extends { id: number }>(table: EntityTable<T, 'id'>): LooseTable {
  return table as unknown as LooseTable
}

async function bulkAddRows(table: LooseTable, rows: Record<string, unknown>[]): Promise<number | undefined> {
  const lastKey = await table.bulkAdd(rows)
  return typeof lastKey === 'number' ? lastKey : undefined
}

/** 只接受「对象元素」的数组；非对象元素直接丢弃，避免脏数据在后续 merge 中炸开。 */
function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
}

/** 备份 `config` 段里各键的人可读名（顺序与备份写入顺序一致） */
const CONFIG_LABELS: Array<[string, string]> = [
  ['categories', '分类'],
  ['fields', '字段表'],
  ['templates', '模板'],
  ['infoGroups', '基本信息组'],
  ['bodyGroups', '正文组'],
  ['folders', '文件夹清单'],
]

export function validateImportData(json: unknown): ImportSummary {
  if (json === null || typeof json !== 'object') {
    throw new Error('无效的数据格式：数据不是 JSON 对象')
  }

  const payload = json as Record<string, unknown>

  // version 1 = 我们自己的备份；version 2 = fork 版（多了 data.maps，其余结构一致）
  const version = payload.version
  if (version !== 1 && version !== 2) {
    throw new Error(`不支持的版本：${String(version)}，仅支持 version 1 / 2`)
  }

  const data = payload.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') {
    throw new Error('缺少 data 字段')
  }

  const tables = ['characters', 'events', 'countries', 'worldEntries', 'tags'] as const

  for (const table of tables) {
    if (!Array.isArray(data[table])) {
      throw new Error(`缺少 data.${table} 数组`)
    }
  }

  // periods 为 v1 后期新增字段，旧备份可能缺失，向后兼容按 0 处理
  const periods = asRows(data.periods)

  const rawConfig = payload.config
  const config = rawConfig !== null && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? CONFIG_LABELS.filter(([key]) => (rawConfig as Record<string, unknown>)[key] !== undefined).map(
        ([, label]) => label,
      )
    : undefined

  return {
    maps: version === 2 ? asRows(data.maps).length : undefined,
    config: config !== undefined && config.length > 0 ? config : undefined,
    characters: asRows(data.characters).length,
    events: asRows(data.events).length,
    countries: asRows(data.countries).length,
    worldEntries: asRows(data.worldEntries).length,
    tags: asRows(data.tags).length,
    periods: periods.length,
  }
}

/** 扁平表的名字键：小写 + 去空白；不是字符串就当没有名字（调用方会直接新增） */
function nameKeyOf(row: Record<string, unknown>, nameField: string): string {
  const name = row[nameField]
  return typeof name === 'string' ? name.toLowerCase().trim() : ''
}

/**
 * 笔记的**复合键**：`分类 + 父级标题 + 标题`。
 *
 * 只用标题判同名是错的：两本书各有一章「新章节」、或者「地点」类里有个「夜market」
 * 而「组织」类里也有一个，它们是完全不同的条目 —— 按标题去重会把新的那一条**静默跳过**，
 * 用户看到的是「导入了，但书里没有章节」。
 *
 * 父级用**标题**而不是 id：备份里的 id 到了目标库就失效了，标题才是跨库稳定的。
 */
function noteKeyOf(
  row: Record<string, unknown>,
  titleById: ReadonlyMap<number, string>,
): string {
  const title = typeof row.title === 'string' ? row.title.toLowerCase().trim() : ''
  if (title === '') return ''
  const category = typeof row.category === 'string' ? row.category.trim().toLowerCase() : ''
  const parentId = typeof row.parentId === 'number' ? row.parentId : null
  const parentTitle = parentId === null ? '' : (titleById.get(parentId) ?? '').toLowerCase().trim()
  return `${category}\u0000${parentTitle}\u0000${title}`
}

async function processTableMerge(
  table: LooseTable,
  records: Record<string, unknown>[],
  strategy: MergeStrategy,
  nameField: string,
  /**
   * 同名判定键；不传就按 `nameField` 的文本（角色 / 事件 / 国家 / 标签都是平的）。
   * 分成两份是因为**父级 id 在两边含义不同**：库里是真实 id，备份里是备份内的 id。
   */
  keyOf?: {
    existing: (row: Record<string, unknown>) => string
    imported: (row: Record<string, unknown>) => string
  },
): Promise<{
  added: number
  skipped: number
  overwritten: number
  /** 备份里的 id → 落库后的 id（新增与覆盖都记；用来重映射 `parentId`） */
  idMap: Map<number, number>
}> {
  if (records.length === 0) {
    return { added: 0, skipped: 0, overwritten: 0, idMap: new Map() }
  }

  const idMap = new Map<number, number>()

  if (strategy === 'keep-both') {
    const toAdd = records.map((r) => {
      const { id: _id, ...rest } = r
      void _id
      return rest
    })
    const lastKey = await bulkAddRows(table, toAdd)
    if (typeof lastKey === 'number') {
      const firstKey = lastKey - toAdd.length + 1
      records.forEach((row, index) => {
        const backupId = Number(row.id)
        if (Number.isFinite(backupId)) idMap.set(backupId, firstKey + index)
      })
    }
    return { added: toAdd.length, skipped: 0, overwritten: 0, idMap }
  }

  const existingRecords = await table.toArray()
  const existingByName = new Map<string, Record<string, unknown>>()

  for (const item of existingRecords) {
    const key = keyOf !== undefined ? keyOf.existing(item) : nameKeyOf(item, nameField)
    if (key !== '') existingByName.set(key, item)
  }

  let added = 0
  let skipped = 0
  let overwritten = 0

  const toAdd: Record<string, unknown>[] = []

  for (const rawRecord of records) {
    const rec = rawRecord
    const name = rec[nameField]

    if (typeof name !== 'string') {
      const { id: _id, ...rest } = rec
      void _id
      toAdd.push(rest)
      added++
      continue
    }

    const key = keyOf !== undefined ? keyOf.imported(rec) : name.toLowerCase().trim()
    const existing = key === '' ? undefined : existingByName.get(key)

    if (existing) {
      if (strategy === 'overwrite') {
        const { id: _importId, ...importData } = rec
        void _importId
        await table.put({ ...importData, id: existing.id } as Record<string, unknown>)
        const backupId = Number(rec.id)
        if (Number.isFinite(backupId) && typeof existing.id === 'number') idMap.set(backupId, existing.id)
        overwritten++
      } else {
        skipped++
      }
    } else {
      const { id: _id, ...rest } = rec
      void _id
      toAdd.push(rest)
      added++
    }
  }

  if (toAdd.length > 0) {
    const lastKey = await bulkAddRows(table, toAdd)
    if (typeof lastKey === 'number') {
      // 自增主键连续：用「最后一个 key − 数量 + 1」反推这一批的起点
      const firstKey = lastKey - toAdd.length + 1
      let offset = 0
      for (const rec of records) {
        if (typeof rec[nameField] !== 'string') {
          const backupId = Number(rec.id)
          if (Number.isFinite(backupId)) idMap.set(backupId, firstKey + offset)
          offset += 1
          continue
        }
        const key = keyOf !== undefined ? keyOf.imported(rec) : String(rec[nameField]).toLowerCase().trim()
        const existing = key === '' ? undefined : existingByName.get(key)
        if (existing !== undefined) continue
        const backupId = Number(rec.id)
        if (Number.isFinite(backupId)) idMap.set(backupId, firstKey + offset)
        offset += 1
      }
    }
  }

  return { added, skipped, overwritten, idMap }
}

export async function importData(
  json: unknown,
  strategy: MergeStrategy,
  queryClient?: QueryClient,
): Promise<ImportResult> {
  const payload = json as ImportPayload
  const records = payload.data
  // 旧备份可能不含 periods，向后兼容按空数组处理
  const periods = records.periods ?? []
  records.periods = periods
  // 项目元信息为单例，旧备份同样可能缺失
  const metaRecords = Array.isArray(records.meta) ? records.meta : []

  const result = await db.transaction(
    'rw',
    [db.characters, db.events, db.countries, db.worldEntries, db.tags, db.periods, db.meta],
    async () => {
      if (strategy === 'replace') {
        await db.characters.clear()
        await db.events.clear()
        await db.countries.clear()
        await db.worldEntries.clear()
        await db.tags.clear()
        await db.periods.clear()
        await db.meta.clear()

        await Promise.all([
          records.characters.length > 0
            ? bulkAddRows(looseTable(db.characters), records.characters)
            : Promise.resolve(),
          records.events.length > 0
            ? bulkAddRows(looseTable(db.events), records.events)
            : Promise.resolve(),
          records.countries.length > 0
            ? bulkAddRows(looseTable(db.countries), records.countries)
            : Promise.resolve(),
          records.worldEntries.length > 0
            ? bulkAddRows(looseTable(db.worldEntries), records.worldEntries)
            : Promise.resolve(),
          records.tags.length > 0
            ? bulkAddRows(looseTable(db.tags), records.tags)
            : Promise.resolve(),
          periods.length > 0
            ? bulkAddRows(looseTable(db.periods), periods)
            : Promise.resolve(),
          metaRecords.length > 0
            ? bulkAddRows(looseTable(db.meta), metaRecords)
            : Promise.resolve(),
        ])

        const total = records.characters.length + records.events.length + records.countries.length + records.worldEntries.length + records.tags.length + periods.length + metaRecords.length
        return { added: total, skipped: 0, overwritten: 0 }
      }

      let totalAdded = 0
      let totalSkipped = 0
      let totalOverwritten = 0

      const existingNoteTitles = new Map<number, string>()
      for (const row of await db.worldEntries.toArray()) {
        if (typeof row.id === 'number') existingNoteTitles.set(row.id, String(row.title ?? ''))
      }
      const importedNoteTitles = new Map<number, string>()
      for (const row of records.worldEntries) {
        const id = typeof row.id === 'number' ? row.id : Number(row.id)
        if (Number.isFinite(id)) importedNoteTitles.set(id, String(row.title ?? ''))
      }

      /** 备份里的笔记 id → 落库后的 id（父级重映射用） */
      const noteIdMap = new Map<number, number>()

      for (const config of TABLE_CONFIG) {
        const items = records[config.key] ?? []
        const result = await processTableMerge(
          config.table,
          items,
          strategy,
          config.nameField,
          config.key === 'worldEntries'
            ? {
                existing: (row) => noteKeyOf(row, existingNoteTitles),
                imported: (row) => noteKeyOf(row, importedNoteTitles),
              }
            : undefined,
        )
        totalAdded += result.added
        totalSkipped += result.skipped
        totalOverwritten += result.overwritten
        if (config.key === 'worldEntries') {
          for (const [from, to] of result.idMap) noteIdMap.set(from, to)
        }
      }

      /**
       * 笔记的父级重映射。
       *
       * 备份里的 `parentId` 是**备份内的 id**，直接落库会指到目标库里同样数字的**另一行**
       * （小说章节最明显：章挂在别人的书上）。这里按「备份 id → 新 id」把父级换成本库的 id；
       * 父级没能导进来的（被跳过 / 不在备份里）就置空 —— 至少不会挂到别人下面。
       */
      if (noteIdMap.size > 0) {
        for (const row of records.worldEntries) {
          const newId = noteIdMap.get(Number(row.id))
          if (newId === undefined) continue
          const parentFromBackup = typeof row.parentId === 'number' ? row.parentId : null
          const nextParent = parentFromBackup === null ? null : (noteIdMap.get(parentFromBackup) ?? null)
          const current = await db.worldEntries.get(newId)
          if (!current) continue
          if ((current.parentId ?? null) === nextParent) continue
          await db.worldEntries.update(newId, { parentId: nextParent })
        }
      }

      // 项目元信息为单例：直接覆盖本地
      if (metaRecords.length > 0) {
        const hadMeta = (await db.meta.get(1)) !== undefined
        await looseTable(db.meta).put(metaRecords[0])
        if (hadMeta) totalOverwritten += 1
        else totalAdded += 1
      }

      return { added: totalAdded, skipped: totalSkipped, overwritten: totalOverwritten }
    },
  )

  /**
   * 设置段在**数据落库之后**恢复：它写的是 `.ocstudio/` 下的文件（或 localStorage），
   * 不在 Dexie 事务里。目标还没配过时整段恢复，配过就整段保留 —— 规则见 backup-config.ts。
   */
  const config = await restoreBackupConfig(payload.config)
  queryClient?.invalidateQueries()

  return { ...result, config }
}
