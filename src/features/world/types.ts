import type { WorldEntry } from '@/types'

export type { WorldEntry }

export interface WorldFormData {
  title: string
  content: string
  document?: unknown
  category: string
  parentId: number | null
  order: number
  isConcept: boolean
}
