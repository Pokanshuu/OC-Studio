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
  /** 自建字段（键 = 字段表里的 key；内置字段仍走各自的列） */
  custom?: Record<string, string>
}
