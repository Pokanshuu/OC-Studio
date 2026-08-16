import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import type { WorldEntry } from '@/types'
import type { WorldFormData } from './types'

const TABLE = 'worldEntries'

function buildDefaultEntry(data: WorldFormData, overrides: Partial<WorldEntry> = {}): Omit<WorldEntry, 'id'> {
  const now = Date.now()
  return {
    title: data.title,
    content: data.content ?? '',
    category: data.category,
    parentId: data.parentId,
    order: data.order,
    isConcept: data.isConcept,
    references: [],
    tags: data.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    _syncStatus: 'pending',
    _lastModified: now,
    ...overrides,
  }
}

export async function getEntries(): Promise<WorldEntry[]> {
  const all = await db.worldEntries.orderBy('title').toArray()
  return all.filter((e) => !e.deleted)
}

export async function getEntry(id: number): Promise<WorldEntry | undefined> {
  return db.worldEntries.get(id)
}

export async function createEntry(data: WorldFormData): Promise<number> {
  const entry = buildDefaultEntry(data)
  const id = await db.worldEntries.add(entry as WorldEntry)
  await logOperation(TABLE, id, 'title', '', data.title)
  return id
}

export async function updateEntry(id: number, data: Partial<WorldFormData>): Promise<void> {
  const existing = await db.worldEntries.get(id)
  if (!existing) throw new Error(`WorldEntry not found: ${id}`)
  const now = Date.now()
  const updates: Partial<WorldEntry> = { updatedAt: now, _syncStatus: 'pending', _lastModified: now }
  type FieldKey = keyof WorldFormData
  const fields: FieldKey[] = ['title', 'content', 'category', 'parentId', 'order', 'isConcept']
  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue ?? ''))
    }
  }

  if (data.tags !== undefined) {
    ;(updates as Record<string, unknown>).tags = data.tags
    await logOperation(
      TABLE,
      id,
      'tags',
      JSON.stringify(existing.tags ?? []),
      JSON.stringify(data.tags),
    )
  }

  if (data.document !== undefined) {
    const synced = await syncReferenceLabels(data.document as Record<string, unknown>)
    ;(updates as Record<string, unknown>).document = synced
  }

  await db.worldEntries.update(id, updates)

  if (data.title !== undefined) {
    updateReferencesAfterRename('world', id, data.title).catch(() => {})
  }
}

export async function deleteEntry(id: number): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, { deleted: true, _syncStatus: 'pending', _lastModified: now })
  await logOperation(TABLE, id, 'deleted', 'false', 'true')
}

export async function saveEntryContent(
  id: number,
  title: string,
  content: string,
): Promise<void> {
  try {
    const now = Date.now()
    await db.worldEntries.update(id, {
      title,
      content,
      updatedAt: now,
      _syncStatus: 'pending',
      _lastModified: now,
    })
  } catch (err) {
    console.error(`[saveEntryContent] 自动保存失败 id=${id}:`, err)
    throw err
  }
}

export async function reorderEntries(
  updates: { id: number; parentId: number | null; order: number }[],
): Promise<void> {
  const now = Date.now()
  for (const u of updates) {
    await db.worldEntries.update(u.id, {
      parentId: u.parentId,
      order: u.order,
      updatedAt: now,
      _syncStatus: 'pending',
      _lastModified: now,
    })
  }
}

export async function renameEntry(id: number, title: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, {
    title,
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  })

  updateReferencesAfterRename('world', id, title).catch(() => {})
  await logOperation(TABLE, id, 'title', '', title)
}
