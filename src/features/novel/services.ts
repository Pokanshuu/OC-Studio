/**
 * 小说（章节 = 笔记）的最小数据服务。
 *
 * 章节在库里就是 `worldEntries`：`category: '小说'` 只是归属标记，
 * **层级只由 `parentId` 表达**（`docs/小说.md` §1–§2）。
 * 这里只补三件 public API 没覆盖的事：建根、建章、列出小说条目。
 */
import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { WorldEntry } from '@/types'

export const NOVEL_CATEGORY = '小说'

function baseRow(title: string, parentId: number | null, order: number): Omit<WorldEntry, 'id'> {
  const now = Date.now()
  return {
    title,
    content: '',
    category: NOVEL_CATEGORY,
    parentId,
    order,
    isConcept: false,
    references: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
  }
}

/** 库里的全部小说条目（含章节），按 order 升序 */
export async function listNovelEntries(): Promise<WorldEntry[]> {
  const rows = await db.worldEntries
    .filter((entry) => !entry.deleted && entry.category === NOVEL_CATEGORY)
    .toArray()
  return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

async function nextOrder(): Promise<number> {
  const rows = await listNovelEntries()
  return rows.reduce((max, row) => Math.max(max, row.order ?? 0), 0) + 1
}

/** 新建一本小说（根节点） */
export async function createNovelRoot(title = '新小说'): Promise<number> {
  const order = await nextOrder()
  const id = await db.worldEntries.add(baseRow(title, null, order))
  await logOperation('worldEntries', id, 'title', '', title)
  return id
}

/** 在某一层下新建章节 / 卷 */
export async function createNovelChapter(parentId: number | null, title = '新章节'): Promise<number> {
  const order = await nextOrder()
  const id = await db.worldEntries.add(baseRow(title, parentId, order))
  await logOperation('worldEntries', id, 'title', '', title)
  return id
}

/** 重命名（走 updateEntry 那条路会把 `category` 抹掉，这里直接写 title） */
export async function renameNovelEntry(id: number, title: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, { title, updatedAt: now, ...pendingStamp(now) })
  await logOperation('worldEntries', id, 'title', '', title)
}
