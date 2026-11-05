import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import type { WorldEntry } from '@/types'
import type { WorldFormData } from './types'
import { isCodexEntry } from '@/lib/entry-kinds'
import { getCategories, loadCategories } from '@/lib/categories/store'
import { worldBodyPatch } from '@/lib/world-body'

const TABLE = 'worldEntries'

function buildDefaultEntry(data: WorldFormData, overrides: Partial<WorldEntry> = {}): Omit<WorldEntry, 'id'> {
  const now = Date.now()
  return {
    title: data.title,
    content: data.content ?? '',
    summary: data.summary ?? '',
    cover: data.cover,
    // `category` 现在是「自定义分类」的归属键（空 = 普通词条，进世界观目录树）。
    // 历史上它还兼过层级用途，那部分早已由 `parentId` 取代。
    category: data.category ?? '',
    template: data.template,
    custom: data.custom,
    parentId: data.parentId,
    order: data.order,
    isConcept: data.isConcept,
    references: [],
    tags: data.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getEntries(): Promise<WorldEntry[]> {
  const rows = await listActive(db.worldEntries, 'title')
  // 分类表可能还没装载（首次进世界观的查询早于 AppShell 的 effect）；
  // 先等它一次，否则刚打开时会把分类条目当普通词条混进目录树。
  await loadCategories()
  // 小说章节、地图、以及「已启用的自定义分类」条目都不进世界观目录树。
  // 关掉的内置分类（宠物 / 武器）不参与过滤：盘上原本就带 `分类: 宠物` 的老笔记，
  // 在用户启用分类之前至少还能在世界观里找到，不至于凭空消失。
  const categoryNames = new Set(
    getCategories().filter((category) => category.enabled).map((category) => category.name),
  )
  return rows.filter((row) => isCodexEntry(row) && !categoryNames.has(row.category ?? ''))
}

export async function getEntry(id: number): Promise<WorldEntry | undefined> {
  return getById(db.worldEntries, id)
}

export async function createEntry(data: WorldFormData): Promise<number> {
  const entry = buildDefaultEntry(data)
  const id = await db.worldEntries.add(entry)
  await logOperation(TABLE, id, 'title', '', data.title)
  return id
}

export async function updateEntry(id: number, data: Partial<WorldFormData>): Promise<void> {
  const existing = await db.worldEntries.get(id)
  if (!existing) throw new Error(`WorldEntry not found: ${id}`)
  const now = Date.now()
  const updates: Partial<WorldEntry> = { updatedAt: now, ...pendingStamp(now) }
  type FieldKey = keyof WorldFormData
  const fields: FieldKey[] = ['title', 'content', 'summary', 'cover', 'parentId', 'order', 'isConcept', 'category', 'template']
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

  if (data.custom !== undefined) {
    ;(updates as Record<string, unknown>).custom = data.custom
    await logOperation(
      TABLE,
      id,
      'custom',
      JSON.stringify(existing.custom ?? {}),
      JSON.stringify(data.custom),
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
  await softDelete(db.worldEntries, id, TABLE)
}

/** 分类改名时把归属键一起搬过去：笔记里存的是分类名，不搬就会整类「消失」 */
export async function renameCategoryEntries(from: string, to: string): Promise<void> {
  if (from.trim() === '' || to.trim() === '' || from === to) return
  const rows = await db.worldEntries.filter((row) => !row.deleted && (row.category ?? '') === from).toArray()
  if (rows.length === 0) return
  const now = Date.now()
  for (const row of rows) {
    await db.worldEntries.update(row.id, { category: to, updatedAt: now, ...pendingStamp(now) })
  }
}

export async function saveEntryContent(
  id: number,
  title: string,
  doc: unknown,
): Promise<void> {
  try {
    const now = Date.now()
    // 正文只写 `document`，`content` 顺手清空 —— 两份真源必然漂，见 `lib/world-body.ts`
    await db.worldEntries.update(id, {
      title,
      ...worldBodyPatch(doc),
      updatedAt: now,
      ...pendingStamp(now),
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
      ...pendingStamp(now),
    })
  }
}

export async function renameEntry(id: number, title: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, {
    title,
    updatedAt: now,
    ...pendingStamp(now),
  })

  updateReferencesAfterRename('world', id, title).catch(() => {})
  await logOperation(TABLE, id, 'title', '', title)
}
