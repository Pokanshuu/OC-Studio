import type { WorldEntry } from '@/types'

/** 词条正文：JSON 字符串 → TipTap 可用的对象；非法/空值原样返回 */
export function parseEditorContent(content: string): object | string {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed && typeof parsed === 'object') return parsed as object
    return content
  } catch {
    return content
  }
}

/** 判断一份 TipTap JSON 文档里是否引用了某个实体（wikiLink / mention） */
export function docHasRef(node: unknown, idStr: string): boolean {
  if (Array.isArray(node)) return node.some((n) => docHasRef(n, idStr))
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>
  if ((n.type === 'wikiLink' || n.type === 'mention') && n.attrs && typeof n.attrs === 'object') {
    if (String((n.attrs as Record<string, unknown>).id) === idStr) return true
  }
  return Array.isArray(n.content) ? docHasRef(n.content, idStr) : false
}

/** 目录搜索：命中项的祖先一并保留，维持树的形状 */
export function filterEntriesWithAncestors(entries: WorldEntry[], query: string): WorldEntry[] {
  const key = query.trim().toLowerCase()
  if (!key) return entries
  const byId = new Map<number, WorldEntry>()
  for (const e of entries) if (e.id != null) byId.set(e.id, e)
  const keep = new Set<number>()
  for (const e of entries) {
    if (e.id == null || !e.title.toLowerCase().includes(key)) continue
    keep.add(e.id)
    let parent = e.parentId
    while (parent != null && !keep.has(parent)) {
      keep.add(parent)
      parent = byId.get(parent)?.parentId ?? null
    }
  }
  return entries.filter((e) => e.id != null && keep.has(e.id))
}
