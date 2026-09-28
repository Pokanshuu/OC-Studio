import { db } from '@/lib/db'
import type { QueryClient } from '@tanstack/react-query'
import type { Table, EntityTable } from 'dexie'

interface ImportPayload {
  version: 1
  exportedAt: string
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

async function bulkAddRows(table: LooseTable, rows: Record<string, unknown>[]): Promise<void> {
  await table.bulkAdd(rows)
}

/** 只接受「对象元素」的数组；非对象元素直接丢弃，避免脏数据在后续 merge 中炸开。 */
function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
}

export function validateImportData(json: unknown): ImportSummary {
  if (json === null || typeof json !== 'object') {
    throw new Error('无效的数据格式：数据不是 JSON 对象')
  }

  const payload = json as Record<string, unknown>

  if (payload.version !== 1) {
    throw new Error(`不支持的版本：${String(payload.version)}，仅支持 version 1`)
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

  return {
    characters: asRows(data.characters).length,
    events: asRows(data.events).length,
    countries: asRows(data.countries).length,
    worldEntries: asRows(data.worldEntries).length,
    tags: asRows(data.tags).length,
    periods: periods.length,
  }
}

async function processTableMerge(
  table: LooseTable,
  records: Record<string, unknown>[],
  strategy: MergeStrategy,
  nameField: string,
): Promise<{ added: number; skipped: number; overwritten: number }> {
  if (records.length === 0) return { added: 0, skipped: 0, overwritten: 0 }

  if (strategy === 'keep-both') {
    const toAdd = records.map((r) => {
      const { id: _id, ...rest } = r
      void _id
      return rest
    })
    await bulkAddRows(table, toAdd)
    return { added: toAdd.length, skipped: 0, overwritten: 0 }
  }

  const existingRecords = await table.toArray()
  const existingByName = new Map<string, Record<string, unknown>>()

  for (const item of existingRecords) {
    const name = item[nameField]
    if (typeof name === 'string') {
      existingByName.set(name.toLowerCase().trim(), item)
    }
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

    const key = name.toLowerCase().trim()
    const existing = existingByName.get(key)

    if (existing) {
      if (strategy === 'overwrite') {
        const { id: _importId, ...importData } = rec
        void _importId
        await table.put({ ...importData, id: existing.id } as Record<string, unknown>)
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
    await bulkAddRows(table, toAdd)
  }

  return { added, skipped, overwritten }
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

      for (const config of TABLE_CONFIG) {
        const items = records[config.key] ?? []
        const result = await processTableMerge(config.table, items, strategy, config.nameField)
        totalAdded += result.added
        totalSkipped += result.skipped
        totalOverwritten += result.overwritten
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

  queryClient?.invalidateQueries()

  return result
}
