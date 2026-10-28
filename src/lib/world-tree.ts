import type { WorldEntry } from '@/types'

export interface WorldTreeNode {
  entry: WorldEntry
  children: WorldTreeNode[]
}

/**
 * 扁平词条 → 树（唯一实现）。
 *
 * 词条的层级**只由 `parentId` 决定** —— 编辑器的目录树、静态站导出的章节划分都走这一个函数，
 * 免得两边各排一次序、慢慢漂移。同一层按 `order` 再按标题（zh-Hans）排。
 *
 * `parentId` 指向不存在的词条（数据半损坏 / 父级被删）时，该条当根处理，不会消失。
 */
export function buildEntryTree(entries: WorldEntry[]): WorldTreeNode[] {
  const map = new Map<number, WorldTreeNode>()
  const roots: WorldTreeNode[] = []

  for (const entry of entries) {
    map.set(entry.id, { entry, children: [] })
  }

  for (const entry of entries) {
    const node = map.get(entry.id)
    if (node === undefined) continue
    if (entry.parentId !== null && entry.parentId !== undefined) {
      const parent = map.get(entry.parentId)
      if (parent !== undefined) parent.children.push(node)
      else roots.push(node)
    } else {
      roots.push(node)
    }
  }

  const sort = (nodes: WorldTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.entry.order ?? 0) - (b.entry.order ?? 0) ||
        a.entry.title.localeCompare(b.entry.title, 'zh-Hans'),
    )
    for (const node of nodes) sort(node.children)
  }
  sort(roots)

  return roots
}
