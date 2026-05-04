import { db } from '@/lib/db'
import type { QueryClient } from '@tanstack/react-query'

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

export async function importData(json: unknown, queryClient?: QueryClient): Promise<void> {
  const payload = json as ImportPayload

  await db.characters.clear()
  await db.events.clear()
  await db.countries.clear()
  await db.worldEntries.clear()
  await db.tags.clear()

  const records = payload.data

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

  queryClient?.invalidateQueries()
}
