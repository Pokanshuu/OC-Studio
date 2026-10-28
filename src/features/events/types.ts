import type { Event } from '@/types'

export type { Event }

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
  tags: number[]
  /** 自定义字段的值（键 = 字段表里的 key） */
  custom?: Record<string, string>
}
