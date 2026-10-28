import type { WorldEntry } from '@/types'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'

export type TreeNode = WorldTreeNode

export const STORAGE_KEY = 'world-tree-expanded'

/** 展开态持久化（localStorage） */
export function loadExpanded(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is number => typeof v === 'number'))
      }
    }
  } catch { /* ignore */ }
  return new Set()
}

export function saveExpanded(ids: Set<number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])) } catch { /* ignore */ }
}

/** 扁平词条 → 树；同一层按 order 再按标题（zh-Hans）排序。实现见 `lib/world-tree`（导出侧共用同一份） */
export function buildTree(entries: WorldEntry[]): TreeNode[] {
  return buildEntryTree(entries)
}

/** 计算一次拖拽后需要写回的顺序（旧父级与目标父级两层） */
export function computeReorder(
  entries: WorldEntry[],
  draggedId: number,
  newParentId: number | null,
  insertBeforeId: number | null,
): { id: number; parentId: number | null; order: number }[] {
  const dragged = entries.find((e) => e.id === draggedId)
  if (!dragged) return []
  const oldParentId = dragged.parentId
  const updates: { id: number; parentId: number | null; order: number }[] = []

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
