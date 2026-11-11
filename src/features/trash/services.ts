import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { TrashItem, TrashItemType } from './types'
import { getVaultSession } from '@/lib/vault/vault-session'
import { vaultFs } from '@/lib/vault/vault-fs'

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

/**
 * 恢复一条（笔记 / 小说会连整棵树一起）。
 *
 * 返回**实际恢复了几行**：小说恢复一章会把书和它的子章节一起带回来，
 * 界面上只说「已恢复」会让人以为只恢复了一条，回头在书里数章节才发现多了。
 */
export async function restoreItem(type: TrashItemType, id: number): Promise<number> {
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
  return ids.length
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

/**
 * 永久删除一条（笔记 / 小说连**子孙**一起）。
 *
 * 只删自己是不够的：回收站里「永久删除」一本书，章节会作为孤儿留在回收站里，
 * 文件也继续占着回收站目录。反过来**不能连祖先一起删** —— 删一章就把整本书删掉
 * 这种事绝对不能发生，所以这里只向下走（`withEntryTree` 是上下都走的，恢复才用它）。
 *
 * 返回实际删掉的行数，界面据此说「已永久删除 N 项」。
 */
export async function permanentlyDeleteItem(
  type: TrashItemType,
  id: number,
): Promise<number> {
  const table = db.table(TABLES[type])
  const ids = type === 'worldEntry' ? await withEntryDescendants(id) : [id]

  // 笔记库模式下回收站里的东西是**文件**：只删 Dexie 行等于把文件留在
  // `.ocstudio/trash/<批次>/` 里，占着磁盘直到保留期过。删不掉就说出来（行也不删，
  // 用户还能再试一次），别装作已经删干净了。
  await removeTrashedFiles(TABLES[type], ids)

  for (const rowId of ids) await table.delete(rowId)
  return ids.length
}

/** 把这些行对应的回收站文件删掉（不在笔记库 / 不在回收站里的行直接跳过） */
async function removeTrashedFiles(tableName: string, ids: number[]): Promise<void> {
  const session = getVaultSession()
  if (session === null) return
  const wanted = new Set(ids)
  for (const state of session.entries.values()) {
    if (state.table !== tableName || !wanted.has(state.id)) continue
    if (!state.relPath.startsWith('.ocstudio/trash/')) continue
    try {
      await vaultFs.remove(session.root, state.relPath)
    } catch (error) {
      throw new Error(
        `文件删不掉：${state.relPath}（${error instanceof Error ? error.message : String(error)}）`,
      )
    }
  }
}

/** 自己 + 所有子孙（只向下，不碰祖先） */
async function withEntryDescendants(id: number): Promise<number[]> {
  const rows = await db.worldEntries.toArray()
  const tree = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) {
      if (row.parentId == null || tree.has(row.id) || !tree.has(row.parentId)) continue
      tree.add(row.id)
      grew = true
    }
  }
  return [...tree]
}
