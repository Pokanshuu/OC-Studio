import type { Event } from '@/types'

export interface TimelineEvent {
  id: number
  title: string
  time: string
  endTime?: string
  summary: string
  isMajor: boolean
}

export function pickTimelineFields(event: Event): TimelineEvent {
  return {
    id: event.id as number,
    title: event.title,
    time: event.time,
    endTime: event.endTime,
    summary: event.summary,
    isMajor: event.isMajor,
  }
}

export type TimelineScale = 'year' | 'month' | 'day'
