/**
 * 能力层的 Dexie 适配器（桌面 / Mock 共用）。
 *
 * 只做「列 / 取 / 标签」三件事；软删除的行不返回。权限不在这里判断 ——
 * 如果 store 自己放行，内置 agent 就能绕过能力层直接拿数据。
 */
import { db } from '@/lib/db'
import type { CapabilityStore, EntityKind, EntityRecordMap } from './types'

export function createDexieCapabilityStore(): CapabilityStore {
  return {
    async list<K extends EntityKind>(kind: K): Promise<EntityRecordMap[K][]> {
      switch (kind) {
        case 'character':
          return (await db.characters.filter((row) => !row.deleted).toArray()) as EntityRecordMap[K][]
        case 'event':
          return (await db.events.filter((row) => !row.deleted).toArray()) as EntityRecordMap[K][]
        case 'country':
          return (await db.countries.filter((row) => !row.deleted).toArray()) as EntityRecordMap[K][]
        default:
          return (await db.worldEntries.filter((row) => !row.deleted).toArray()) as EntityRecordMap[K][]
      }
    },

    async get<K extends EntityKind>(kind: K, id: number): Promise<EntityRecordMap[K] | null> {
      const row =
        kind === 'character'
          ? await db.characters.get(id)
          : kind === 'event'
            ? await db.events.get(id)
            : kind === 'country'
              ? await db.countries.get(id)
              : await db.worldEntries.get(id)
      if (!row || row.deleted) return null
      return row as EntityRecordMap[K]
    },

    async tags() {
      return db.tags.toArray()
    },
  }
}
