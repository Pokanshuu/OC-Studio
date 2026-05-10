import type { Event } from '@/types'

export type { Event }

export interface EventFormData {
  title: string
  time: string
  location: string
  summary: string
  isMajor: boolean
  content: string
  document?: unknown
  characters?: number[]
  countries?: number[]
}
