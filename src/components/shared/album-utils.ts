import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import type { AlbumEntry } from './useAlbumData'

export interface SubCategory {
  key: string
  label: string
  sourceType: string
  category: string
}

export interface TopCategory {
  key: string
  label: string
  children: SubCategory[]
}

/** 相册里的图片来源实体（一个角色 / 事件 / 国家） */
export interface AlbumSource {
  id: number
  name: string
}

export const CATEGORY_TREE: TopCategory[] = [
  {
    key: 'character', label: '角色',
    children: [
      { key: 'character:avatar', label: '头像', sourceType: 'character', category: 'avatar' },
      { key: 'character:fullbody', label: '立绘', sourceType: 'character', category: 'fullbody' },
      { key: 'character:header', label: '封面', sourceType: 'character', category: 'header' },
      { key: 'character:gallery', label: '相册图片', sourceType: 'character', category: 'gallery' },
    ],
  },
  {
    key: 'event', label: '事件',
    children: [
      { key: 'event:header', label: '封面', sourceType: 'event', category: 'header' },
      { key: 'event:gallery', label: '图片', sourceType: 'event', category: 'gallery' },
    ],
  },
  {
    key: 'country', label: '国家',
    children: [
      { key: 'country:flag', label: '标志', sourceType: 'country', category: 'flag' },
      { key: 'country:header', label: '封面', sourceType: 'country', category: 'header' },
    ],
  },
]

export function getTopCount(entries: AlbumEntry[], top: TopCategory): number {
  return entries.filter((e) =>
    top.children.some((sub) => sub.sourceType === e.sourceType && sub.category === e.category)
  ).length
}

export function getSubCount(entries: AlbumEntry[], sub: SubCategory): number {
  return entries.filter((e) => e.sourceType === sub.sourceType && e.category === sub.category).length
}

/** 当前选中分类对应的实体类型（顶级的 key 就是 sourceType）；'all' / 未知分类返回 null */
export function albumSourceType(selectedKey: string): string | null {
  if (selectedKey === 'all') return null
  const top = CATEGORY_TREE.find((t) => t.key === selectedKey)
  if (top) return top.key
  for (const t of CATEGORY_TREE) {
    if (t.children.some((sub) => sub.key === selectedKey)) return t.key
  }
  return null
}

/** 实体类型的中文名：角色 / 事件 / 国家 */
export function albumSourceLabel(sourceType: string): string {
  return CATEGORY_TREE.find((t) => t.key === sourceType)?.label ?? ''
}

/** 条目是否落在当前分类里（顶级 = 该类型全部子类，子级 = 单一类别） */
export function matchesAlbumCategory(entry: AlbumEntry, selectedKey: string): boolean {
  if (selectedKey === 'all') return true
  const top = CATEGORY_TREE.find((t) => t.key === selectedKey)
  if (top) {
    return top.children.some(
      (sub) => sub.sourceType === entry.sourceType && sub.category === entry.category,
    )
  }
  for (const t of CATEGORY_TREE) {
    const sub = t.children.find((s) => s.key === selectedKey)
    if (sub) return entry.sourceType === sub.sourceType && entry.category === sub.category
  }
  return true
}

/** 某一类实体在给定条目里出现过的来源（同一实体只出现一次，按名字排序） */
export function collectAlbumSources(entries: AlbumEntry[], sourceType: string): AlbumSource[] {
  const names = new Map<number, string>()
  for (const entry of entries) {
    if (entry.sourceType !== sourceType) continue
    if (!names.has(entry.sourceId)) names.set(entry.sourceId, entry.sourceName)
  }
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
}

export function getEntryImageUrl(entry: AlbumEntry): string {
  const typeMap: Record<string, string> = {
    avatar: 'avatar', fullbody: 'avatar',
    header: 'avatar', gallery: 'avatar', flag: 'flag',
  }
  const url = resolveImageUrl(entry.url)
  if (url.includes('/defaults/')) return url
  return url || getDefaultImage(typeMap[entry.category] || 'avatar')
}
