import type { Event } from '@/types'

export interface TimelineEvent {
  id: number
  title: string
  time: string
  endTime?: string
  summary: string
  isMajor: boolean
  /**
   * 节点来源。缺省 = 真事件。
   * `birth` 是由角色生日合成的伪节点：不可拖拽（拖了会去改事件的 time），点击跳角色。
   */
  kind?: 'birth'
  /** `kind === 'birth'` 时指向的角色 id */
  characterId?: number
}

export function pickTimelineFields(event: Event): TimelineEvent {
  return {
    id: event.id,
    title: event.title,
    time: event.time,
    endTime: event.endTime,
    summary: event.summary,
    isMajor: event.isMajor,
  }
}

export type TimelineScale = 'year' | 'month' | 'day'

export interface ComputedEvent {
  event: TimelineEvent
  x: number
  width: number
  lane: number
}

export interface FilterOption {
  value: number | 'all'
  label: string
}


