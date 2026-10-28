import type { Event, EventRelation } from '@/types'

export type { Event, EventRelation }

export interface EventFormData {
  title: string
  time: string
  endTime?: string
  location: string
  summary: string
  isMajor: boolean
  content: string
  document?: unknown
  headerUrl?: string
  characters?: number[]
  countries?: number[]
  /** 相关事件（与角色关系同形：目标 id + 关系名） */
  relations?: EventRelation[]
  tags: number[]
  /** 自定义字段的值（键 = 字段表里的 key） */
  custom?: Record<string, string>
}
