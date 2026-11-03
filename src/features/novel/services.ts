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

export { NOVEL_CATEGORY } from '@/lib/novel'
import { NOVEL_CATEGORY } from '@/lib/novel'

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

/**
 * 同父级内上移 / 下移（交换 `order`）。
 *
 * 排序口径与 `buildEntryTree` 完全一致（`order` 再按标题），所以「目录里看到的位置」
 * 就是「交换后的位置」。老数据 / fork 导入可能整层 `order` 都是 0：先按当前顺序
 * 归一化成 10 / 20 / 30…再交换，否则两个 0 互换等于没动。
 * 已在两端时返回 false，调用方据此置灰按钮。
 */
export async function moveNovelEntry(
  id: number,
  direction: 'up' | 'down',
): Promise<boolean> {
  const entry = await db.worldEntries.get(id)
  if (!entry || entry.deleted) return false

  const siblings = (
    await db.worldEntries
      .filter(
        (row) =>
          !row.deleted && row.category === NOVEL_CATEGORY && row.parentId === entry.parentId,
      )
      .toArray()
  ).sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans'),
  )

  const index = siblings.findIndex((row) => row.id === id)
  if (index < 0) return false
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= siblings.length) return false

  const now = Date.now()
  let currentOrder = entry.order ?? 0
  if (currentOrder === (siblings[swapIndex].order ?? 0)) {
    for (const [position, row] of siblings.entries()) {
      const order = (position + 1) * 10
      row.order = order
      await db.worldEntries.update(row.id, { order, updatedAt: now, ...pendingStamp(now) })
    }
    currentOrder = (index + 1) * 10
  }

  const neighbor = siblings[swapIndex]
  const neighborId = neighbor.id
  const neighborOrder = neighbor.order ?? 0
  await db.worldEntries.update(id, {
    order: neighborOrder,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await db.worldEntries.update(neighborId, {
    order: currentOrder,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'order', String(currentOrder), String(neighborOrder))
  return true
}

/** 重命名（走 updateEntry 那条路会把 `category` 抹掉，这里直接写 title） */
export async function renameNovelEntry(id: number, title: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, { title, updatedAt: now, ...pendingStamp(now) })
  await logOperation('worldEntries', id, 'title', '', title)
}

/** 作品级元信息（只有根节点写这些键） */
export interface NovelMetaPatch {
  novelAuthor?: string
  novelSynopsis?: string
  novelTargetWords?: number
  novelNotes?: string
  novelCover?: string
}

export async function updateNovelMeta(id: number, patch: NovelMetaPatch): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, { ...patch, updatedAt: now, ...pendingStamp(now) })
  await logOperation('worldEntries', id, 'novel_meta', '', Object.keys(patch).join(','))
}

/** 章节大纲 / 备注（一行说明，不是正文） */
export async function updateChapterOutline(id: number, outline: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, { chapterOutline: outline, updatedAt: now, ...pendingStamp(now) })
  await logOperation('worldEntries', id, 'chapter_outline', '', outline)
}
