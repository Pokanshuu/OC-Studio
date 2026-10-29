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

export function getEntryImageUrl(entry: AlbumEntry): string {
  const typeMap: Record<string, string> = {
    avatar: 'avatar', fullbody: 'avatar',
    header: 'avatar', gallery: 'avatar', flag: 'flag',
  }
  const url = resolveImageUrl(entry.url)
  if (url.includes('/defaults/')) return url
  return url || getDefaultImage(typeMap[entry.category] || 'avatar')
}
