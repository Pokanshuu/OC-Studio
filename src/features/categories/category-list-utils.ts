/**
 * 分类列表的排序偏好 —— 与角色 / 事件列表同一套 `SortSelect` 控件。
 *
 * 分类条目是普通笔记，没有封面卡，所以只保留三种最有用的排法；
 * 手动排序留给下一步（`SortableList` + `order` 键）。
 */
import { worldBodyOf } from '@/lib/world-body'
import { normalizeViewMode, type SortOption } from '@/components/shared/SortViewControls'
import type { WorldEntry } from '@/types'
import { compareManual, readSortKey, writeSortKey } from '@/lib/sort-manual'

export type CategorySortKey = 'manual' | 'updatedAt' | 'createdAt' | 'title'

/** 分类条目没有封面槽位时只有目录 / 卡片两态；现在有 3:2 封面，画廊也接上 */
export type CategoryViewMode = 'grid' | 'gallery' | 'list'

const CATEGORY_VIEW_STORAGE_KEY = 'oc-categories-view'

/** 与角色 / 事件 / 国家同一默认：卡片视图（坏值回落 grid） */
export function readCategoryViewMode(): CategoryViewMode {
  if (typeof window === 'undefined') return 'grid'
  return normalizeViewMode(localStorage.getItem(CATEGORY_VIEW_STORAGE_KEY))
}

export function writeCategoryViewMode(mode: CategoryViewMode): void {
  if (typeof window !== 'undefined') localStorage.setItem(CATEGORY_VIEW_STORAGE_KEY, mode)
}

export const CATEGORY_SORT_OPTIONS: SortOption[] = [
  { label: '手动排序', value: 'manual' },
  { label: '按名称', value: 'title' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

export const CATEGORY_SORT_STORAGE_KEY = 'oc-categories-sort'

export function readCategorySortKey(): CategorySortKey {
  return readSortKey<CategorySortKey>(CATEGORY_SORT_STORAGE_KEY, 'updatedAt')
}

export function writeCategorySortKey(key: CategorySortKey): void {
  writeSortKey(CATEGORY_SORT_STORAGE_KEY, key)
}

export function sortCategoryEntries(entries: WorldEntry[], key: CategorySortKey): WorldEntry[] {
  const next = entries.slice()
  if (key === 'manual') {
    next.sort(compareManual)
    return next
  }
  if (key === 'title') {
    next.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    return next
  }
  next.sort((a, b) => {
    const av = key === 'createdAt' ? a.createdAt : a.updatedAt
    const bv = key === 'createdAt' ? b.createdAt : b.updatedAt
    if (av !== bv) return bv - av
    return a.id - b.id
  })
  return next
}

/** 搜索：标题 / 简介 / 正文纯文本（正文是 Tiptap JSON 字符串，只抽 text 节点） */
export function entryMatchesQuery(entry: WorldEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  if (entry.title.toLowerCase().includes(q)) return true
  if ((entry.summary ?? '').toLowerCase().includes(q)) return true
  if (Object.values(entry.custom ?? {}).some((value) => typeof value === 'string' && value.toLowerCase().includes(q))) return true
  return entryBodyText(entry).toLowerCase().includes(q)
}

export function entryBodyText(entry: WorldEntry): string {
  const body = worldBodyOf(entry)
  if (typeof body === 'string') {
    // 老数据：`content` 里直接是纯文本 / Markdown（可能带 HTML 标签）
    return body.trim() === '' ? '' : body.replace(/<[^>]+>/g, ' ')
  }
  const text: string[] = []
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') text.push(record.text)
    const content = record.content
    if (Array.isArray(content)) content.forEach(walk)
  }
  walk(body)
  return text.join(' ')
}
