import { db } from '@/lib/db'
import type { Table } from 'dexie'
import type { Tag } from '@/types'

export async function getAllTags(): Promise<Tag[]> {
  return db.tags.orderBy('name').toArray()
}

export async function createTag(data: { name: string; category: string; color: string }): Promise<number> {
  return db.tags.add({
    name: data.name.trim(),
    category: data.category.trim(),
    color: data.color,
  })
}

export async function updateTag(id: number, data: Partial<{ name: string; category: string; color: string }>): Promise<void> {
  const updates: Record<string, string> = {}
  if (data.name !== undefined) updates.name = data.name.trim()
  if (data.category !== undefined) updates.category = data.category.trim()
  if (data.color !== undefined) updates.color = data.color
  await db.tags.update(id, updates)
}

interface TaggableRow {
  id: number
  tags: number[]
}

const TAG_TABLES = ['characters', 'events', 'countries', 'worldEntries'] as const

/** 每个标签被多少篇笔记引用（按 id 数，不读正文） */
export async function getTagUsage(): Promise<Map<number, number>> {
  const usage = new Map<number, number>()
  await Promise.all(
    TAG_TABLES.map(async (name) => {
      const rows = (await db.table(name).toArray()) as Array<{ id?: unknown; tags?: unknown; deleted?: unknown }>
      for (const row of rows) {
        if (row.deleted === true) continue
        if (!Array.isArray(row.tags)) continue
        for (const id of row.tags) {
          if (typeof id === 'number') usage.set(id, (usage.get(id) ?? 0) + 1)
        }
      }
    }),
  )
  return usage
}

/**
 * 合并标签：把引用源标签的实体改成目标标签，再删源标签。
 *
 * 不静默改用户文件：实体只是换了一个 tag id，真正写盘仍走落盘队列；
 * 文件里的 `标签:` 名由该队列按 id 映射成新名字。
 */
export async function mergeTag(sourceId: number, targetId: number): Promise<void> {
  if (sourceId === targetId) return
  await db.transaction(
    'rw',
    [db.characters, db.events, db.countries, db.worldEntries, db.tags],
    async () => {
      for (const name of TAG_TABLES) {
        const table = db.table(name) as Table<TaggableRow, number>
        const rows = await table.toArray()
        for (const row of rows) {
          if (!Array.isArray(row.tags) || !row.tags.includes(sourceId)) continue
          const next = [...new Set(row.tags.map((id) => (id === sourceId ? targetId : id)))]
          await table.update(row.id, { tags: next })
        }
      }
      await db.tags.delete(sourceId)
    },
  )
}

async function removeTagReferences(
  table: Table<TaggableRow, number>,
  tagId: number,
): Promise<void> {
  const rows = await table.toArray()
  const writes: Promise<unknown>[] = []
  for (const row of rows) {
    if (Array.isArray(row.tags) && row.tags.includes(tagId)) {
      writes.push(
        table.update(row.id, {
          tags: row.tags.filter((t) => t !== tagId),
        }),
      )
    }
  }
  await Promise.all(writes)
}

export async function deleteTag(id: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.characters, db.events, db.countries, db.worldEntries, db.tags],
    async () => {
      await removeTagReferences(db.characters as unknown as Table<TaggableRow, number>, id)
      await removeTagReferences(db.events as unknown as Table<TaggableRow, number>, id)
      await removeTagReferences(db.countries as unknown as Table<TaggableRow, number>, id)
      await removeTagReferences(db.worldEntries as unknown as Table<TaggableRow, number>, id)
      await db.tags.delete(id)
    },
  )
}
