import type { Event } from '@/types'

export interface TimelineEvent {
  id: number
  title: string
  time: string
  endTime?: string
  summary: string
  isMajor: boolean
  /** 事件之间的关系（只在该时间线视图里画连线，不改数据） */
  relations?: { targetId: number; relation: string }[]
  /** 参与者（只用于时间线的参与者轨道，不改数据） */
  characters?: number[]
  countries?: number[]
  /**
   * 节点来源。缺省 = 真事件。
   * `birth` 是由角色生日合成的伪节点；`country` 是由国家时间字段合成的建国 / 亡国节点。
   * 两者都不进关系线、参与者轨道，也不可拖拽（拖了会去改事件的时间）。
   */
  kind?: 'birth' | 'country'
  /** `kind === 'birth'` 时指向的角色 id */
  characterId?: number
  /** `kind === 'country'` 时指向的国家 id */
  countryId?: number
  /** `kind === 'country'` 时那个时间字段的显示名（建立时间 / 结束时间） */
  countryField?: string
}

export function pickTimelineFields(event: Event): TimelineEvent {
  return {
    id: event.id,
    title: event.title,
    time: event.time,
    endTime: event.endTime,
    summary: event.summary,
    isMajor: event.isMajor,
    relations: event.relations,
    characters: event.characters,
    countries: event.countries,
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


