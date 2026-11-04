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

/**
 * 计算一次拖拽后需要写回的顺序。
 * 实现已收口到 `lib/tree-order`（小说章节树共用），这里只做转出。
 */
export { computeReorder } from '@/lib/tree-order'
