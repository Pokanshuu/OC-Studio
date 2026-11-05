import type { GalleryImage } from '@/types'

export interface CountryFormData {
  name: string
  parentId: number | null
  description: string
  document?: unknown
  system: string
  geography: string
  culture: string
  flagUrl?: string
  headerUrl?: string
  /** 图集（模板「画廊」组件的槽位） */
  gallery?: GalleryImage[]
  characters?: number[]
  events?: number[]
  tags: number[]
}
