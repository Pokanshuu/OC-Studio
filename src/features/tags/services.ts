import { db } from '@/lib/db'
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

export async function deleteTag(id: number): Promise<void> {
  await db.tags.delete(id)
}
