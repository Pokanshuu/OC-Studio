/**
 * 树形拖拽排序的唯一实现（词条树 / 小说章节树共用）。
 *
 * 输入是「拖了谁、落到哪个父级、插到谁前面」，输出是需要写回的
 * `{ id, parentId, order }` 列表：旧父级与目标父级两层都要重排，
 * 否则拖走之后旧层会留下空号、顺序看起来还是乱的。
 *
 * 排序口径与 `buildEntryTree` 一致：先 `order`，再标题（zh-Hans）。
 */

import type { WorldEntry } from '@/types'

export interface TreeOrderUpdate {
  id: number
  parentId: number | null
  order: number
}

export function computeReorder(
  entries: WorldEntry[],
  draggedId: number,
  newParentId: number | null,
  insertBeforeId: number | null,
): TreeOrderUpdate[] {
  const dragged = entries.find((e) => e.id === draggedId)
  if (!dragged) return []
  const oldParentId = dragged.parentId
  const updates: TreeOrderUpdate[] = []

  if (oldParentId !== newParentId && oldParentId !== undefined) {
    const oldSiblings = entries
      .filter((e) => e.parentId === oldParentId && e.id !== draggedId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans'))
    for (let i = 0; i < oldSiblings.length; i++) {
      updates.push({ id: oldSiblings[i].id, parentId: oldParentId, order: i })
    }
  }

  const newSiblings = entries
    .filter((e) => e.parentId === newParentId && e.id !== draggedId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans'))

  const insertIndex = insertBeforeId !== null
    ? newSiblings.findIndex((s) => s.id === insertBeforeId)
    : -1

  const finalIndex = insertIndex >= 0 ? insertIndex : newSiblings.length
  const reordered = [...newSiblings]
  reordered.splice(finalIndex, 0, { ...dragged, parentId: newParentId })

  for (let i = 0; i < reordered.length; i++) {
    const existing = updates.find((u) => u.id === reordered[i].id)
    if (!existing) {
      updates.push({ id: reordered[i].id, parentId: newParentId, order: i })
    }
  }

  return updates
}
