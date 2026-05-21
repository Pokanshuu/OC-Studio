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
}
