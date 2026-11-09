import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { TrashItem, TrashItemType } from './types'

const TYPE_LABELS: Record<TrashItemType, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  worldEntry: '世界观词条',
}

const TABLES: Record<TrashItemType, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  worldEntry: 'worldEntries',
}

export async function getDeletedItems(): Promise<TrashItem[]> {
  const [allChars, allEvents, allCountries, allEntries] =
    await Promise.all([
      db.characters.orderBy('name').toArray(),
      db.events.orderBy('time').toArray(),
      db.countries.orderBy('name').toArray(),
      db.worldEntries.orderBy('title').toArray(),
    ])

  const deletedChars = allChars.filter((c) => c.deleted === true || (c.deleted as unknown) === 1)
  const deletedEvents = allEvents.filter((e) => e.deleted === true || (e.deleted as unknown) === 1)
  const deletedCountries = allCountries.filter((c) => c.deleted === true || (c.deleted as unknown) === 1)
  const deletedEntries = allEntries.filter((e) => e.deleted === true || (e.deleted as unknown) === 1)

  const items: TrashItem[] = []

  for (const c of deletedChars) {
    if (c.id === undefined) continue
    items.push({
      id: c.id,
      name: c.name,
      type: 'character',
      typeLabel: TYPE_LABELS.character,
      deletedAt: c.updatedAt,
    })
  }

  for (const e of deletedEvents) {
    if (e.id === undefined) continue
    items.push({
      id: e.id,
      name: e.title,
      type: 'event',
      typeLabel: TYPE_LABELS.event,
      deletedAt: e.updatedAt,
    })
  }

  for (const c of deletedCountries) {
    if (c.id === undefined) continue
    items.push({
      id: c.id,
      name: c.name,
      type: 'country',
      typeLabel: TYPE_LABELS.country,
      deletedAt: c.updatedAt,
    })
  }

  for (const entry of deletedEntries) {
    if (entry.id === undefined) continue
    items.push({
      id: entry.id,
      name: entry.title,
      type: 'worldEntry',
      typeLabel: TYPE_LABELS.worldEntry,
      deletedAt: entry.updatedAt,
    })
  }

  items.sort((a, b) => b.deletedAt - a.deletedAt)
  return items
}

export async function restoreItem(type: TrashItemType, id: number): Promise<void> {
  const tableName = TABLES[type]
  const now = Date.now()

  const table = db.table(tableName)
  // 世界观 / 小说是树（`parentId`），回收站里却逐行列。只恢复被点的那一行会出现
  // 「书回来了、章节还在回收站」或「章节回来了、没有父级哪都看不见」，所以整棵树一起带回来。
  const ids = type === 'worldEntry' ? await withEntryTree(id) : [id]

  for (const rowId of ids) {
    await table.update(rowId, {
      deleted: false,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation(tableName, rowId, 'deleted', 'true', 'false')
  }
}

/**
 * 与 `id` 同属一棵树、且**当前仍在回收站**的行（含自己）。
 * 祖先里已经恢复的、没有删过的行不再碰 —— 免得把它们的 `updatedAt` 顶到「最近编辑」前面。
 */
async function withEntryTree(id: number): Promise<number[]> {
  const rows = await db.worldEntries.toArray()
  const byId = new Map(rows.map((row) => [row.id, row]))
  const tree = new Set<number>([id])

  let cursor = byId.get(id)
  for (let guard = 0; cursor?.parentId != null && guard < 128; guard += 1) {
    tree.add(cursor.parentId)
    cursor = byId.get(cursor.parentId)
  }

  // 向下：每一轮把「父级已在树里」的行收进来，直到不再增长
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) {
      if (row.parentId === null || tree.has(row.id) || !tree.has(row.parentId)) continue
      tree.add(row.id)
      grew = true
    }
  }

  const isDeleted = (rowId: number): boolean => {
    if (rowId === id) return true
    const row = byId.get(rowId)
    return row?.deleted === true || (row?.deleted as unknown) === 1
  }
  return [...tree].filter(isDeleted)
}

export async function permanentlyDeleteItem(
  type: TrashItemType,
  id: number,
): Promise<void> {
  const table = db.table(TABLES[type])
  await table.delete(id)
}
