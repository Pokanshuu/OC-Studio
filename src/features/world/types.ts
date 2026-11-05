import type { GalleryImage, WorldEntry } from '@/types'

export type { WorldEntry }

export interface WorldFormData {
  title: string
  content: string
  /** 一行简介（分类条目的副标题；落盘键 简介） */
  summary?: string
  /** 封面（3:2 槽位；落盘键 cover） */
  cover?: string
  /** 头像 / 单张图片 / 图集（模板的 avatar / image / gallery 三个组件） */
  avatar?: string
  image?: string
  gallery?: GalleryImage[]
  /** 时间组件（落盘键 time / endTime；形态与事件一致） */
  time?: string
  endTime?: string
  /** 地点组件（落盘键 location） */
  location?: string
  document?: unknown
  parentId: number | null
  order: number
  isConcept: boolean
  tags: number[]
  /** 自定义分类归属（空 = 普通词条，进世界观目录树） */
  category?: string
  /** 自建字段的值（键 = 字段表里的 key；落盘写 frontmatter 同名键） */
  custom?: Record<string, string>
  /** 单篇覆盖的模板名（空 = 跟随分类 / 内置词条模板） */
  template?: string
}
