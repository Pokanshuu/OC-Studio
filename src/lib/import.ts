import { db } from '@/lib/db'
import type { QueryClient } from '@tanstack/react-query'
import type { Table } from 'dexie'

interface ImportPayload {
  version: 1
  exportedAt: string
  data: {
    characters: unknown[]
    events: unknown[]
    countries: unknown[]
    worldEntries: unknown[]
    tags: unknown[]
  }
}

export interface ImportSummary {
  characters: number
  events: number
  countries: number
  worldEntries: number
  tags: number
}

export type MergeStrategy = 'skip' | 'overwrite' | 'keep-both' | 'replace'

export interface ImportResult {
  added: number
  skipped: number
  overwritten: number
}

const TABLE_CONFIG: Array<{
  key: keyof ImportPayload['data']
  table: Table<Record<string, unknown>, number>
  nameField: string
}> = [
  { key: 'characters', table: db.characters as unknown as Table<Record<string, unknown>, number>, nameField: 'name' },
  { key: 'events', table: db.events as unknown as Table<Record<string, unknown>, number>, nameField: 'title' },
  { key: 'countries', table: db.countries as unknown as Table<Record<string, unknown>, number>, nameField: 'name' },
  { key: 'worldEntries', table: db.worldEntries as unknown as Table<Record<string, unknown>, number>, nameField: 'title' },
  { key: 'tags', table: db.tags as unknown as Table<Record<string, unknown>, number>, nameField: 'name' },
]

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

  return {
    characters: (data.characters as unknown[]).length,
    events: (data.events as unknown[]).length,
    countries: (data.countries as unknown[]).length,
    worldEntries: (data.worldEntries as unknown[]).length,
    tags: (data.tags as unknown[]).length,
  }
}

async function processTableMerge(
  table: Table<Record<string, unknown>, number>,
  records: unknown[],
  strategy: MergeStrategy,
  nameField: string,
): Promise<{ added: number; skipped: number; overwritten: number }> {
  if (records.length === 0) return { added: 0, skipped: 0, overwritten: 0 }

  if (strategy === 'keep-both') {
    const toAdd = records.map((r) => {
      const { id: _id, ...rest } = r as Record<string, unknown>
      void _id
      return rest
    })
    await table.bulkAdd(toAdd as never[])
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

  const toAdd: unknown[] = []

  for (const rawRecord of records) {
    const rec = rawRecord as Record<string, unknown>
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
    await table.bulkAdd(toAdd as never[])
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

  if (strategy === 'replace') {
    await db.characters.clear()
    await db.events.clear()
    await db.countries.clear()
    await db.worldEntries.clear()
    await db.tags.clear()

    await Promise.all([
      records.characters.length > 0
        ? db.characters.bulkAdd(records.characters as never[])
        : Promise.resolve(),
      records.events.length > 0
        ? db.events.bulkAdd(records.events as never[])
        : Promise.resolve(),
      records.countries.length > 0
        ? db.countries.bulkAdd(records.countries as never[])
        : Promise.resolve(),
      records.worldEntries.length > 0
        ? db.worldEntries.bulkAdd(records.worldEntries as never[])
        : Promise.resolve(),
      records.tags.length > 0
        ? db.tags.bulkAdd(records.tags as never[])
        : Promise.resolve(),
    ])

    const total = records.characters.length + records.events.length + records.countries.length + records.worldEntries.length + records.tags.length
    queryClient?.invalidateQueries()
    return { added: total, skipped: 0, overwritten: 0 }
  }

  let totalAdded = 0
  let totalSkipped = 0
  let totalOverwritten = 0

  for (const config of TABLE_CONFIG) {
    const items = records[config.key] as unknown[]
    const result = await processTableMerge(config.table, items, strategy, config.nameField)
    totalAdded += result.added
    totalSkipped += result.skipped
    totalOverwritten += result.overwritten
  }

  queryClient?.invalidateQueries()

  return { added: totalAdded, skipped: totalSkipped, overwritten: totalOverwritten }
}
