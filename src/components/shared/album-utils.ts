import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import type { AlbumEntry } from './useAlbumData'
import { ALBUM_SLOT_LABELS, type AlbumCategory } from './album-labels'

export { ALBUM_EXCLUDED_CATEGORIES, ALBUM_SLOT_LABELS, type AlbumCategory } from './album-labels'

export interface SubCategory {
  key: string
  label: string
  sourceType: string
  category: AlbumCategory
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
      { key: 'character:avatar', label: ALBUM_SLOT_LABELS.avatar, sourceType: 'character', category: 'avatar' },
      { key: 'character:fullbody', label: ALBUM_SLOT_LABELS.fullbody, sourceType: 'character', category: 'fullbody' },
      { key: 'character:header', label: ALBUM_SLOT_LABELS.header, sourceType: 'character', category: 'header' },
      { key: 'character:gallery', label: ALBUM_SLOT_LABELS.gallery, sourceType: 'character', category: 'gallery' },
      { key: 'character:body', label: ALBUM_SLOT_LABELS.body, sourceType: 'character', category: 'body' },
    ],
  },
  {
    key: 'event', label: '事件',
    children: [
      { key: 'event:header', label: ALBUM_SLOT_LABELS.header, sourceType: 'event', category: 'header' },
      { key: 'event:gallery', label: ALBUM_SLOT_LABELS.gallery, sourceType: 'event', category: 'gallery' },
      { key: 'event:body', label: ALBUM_SLOT_LABELS.body, sourceType: 'event', category: 'body' },
    ],
  },
  {
    key: 'country', label: '国家',
    children: [
      { key: 'country:flag', label: ALBUM_SLOT_LABELS.flag, sourceType: 'country', category: 'flag' },
      { key: 'country:header', label: ALBUM_SLOT_LABELS.header, sourceType: 'country', category: 'header' },
      { key: 'country:gallery', label: ALBUM_SLOT_LABELS.gallery, sourceType: 'country', category: 'gallery' },
      { key: 'country:body', label: ALBUM_SLOT_LABELS.body, sourceType: 'country', category: 'body' },
    ],
  },
  {
    key: 'worldEntry', label: '词条',
    children: [
      { key: 'worldEntry:avatar', label: ALBUM_SLOT_LABELS.avatar, sourceType: 'worldEntry', category: 'avatar' },
      { key: 'worldEntry:image', label: ALBUM_SLOT_LABELS.image, sourceType: 'worldEntry', category: 'image' },
      { key: 'worldEntry:gallery', label: ALBUM_SLOT_LABELS.gallery, sourceType: 'worldEntry', category: 'gallery' },
      { key: 'worldEntry:cover', label: ALBUM_SLOT_LABELS.cover, sourceType: 'worldEntry', category: 'cover' },
      { key: 'worldEntry:body', label: ALBUM_SLOT_LABELS.body, sourceType: 'worldEntry', category: 'body' },
    ],
  },
  {
    key: 'world', label: '世界',
    children: [
      { key: 'world:cover', label: ALBUM_SLOT_LABELS.cover, sourceType: 'world', category: 'cover' },
    ],
  },
]

/** 相册条目的槽位名；未知 category 原样返回（不应发生，自检会拦） */
export function albumCategoryLabel(category: string): string {
  return ALBUM_SLOT_LABELS[category as AlbumCategory] ?? category
}

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
    body: 'avatar', cover: 'avatar', image: 'avatar',
  }
  const url = resolveImageUrl(entry.url)
  if (url.includes('/defaults/')) return url
  return url || getDefaultImage(typeMap[entry.category] || 'avatar')
}
