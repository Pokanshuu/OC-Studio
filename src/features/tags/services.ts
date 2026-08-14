import { db } from '@/lib/db'
import type { Table } from 'dexie'
import type { Tag } from '@/types'

export async function getAllTags(): Promise<Tag[]> {
  return db.tags.orderBy('name').toArray()
}

export async function getTag(id: number): Promise<Tag | undefined> {
  return db.tags.get(id)
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
  id?: number
  tags: number[]
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
        table.update(row.id as number, {
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
