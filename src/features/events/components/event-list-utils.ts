import type { ViewMode, SortOption } from '@/components/shared/SortViewControls'
import type { Event } from '@/types'
import { formatEventTime } from '../utils'

export type SortKey = 'manual' | 'time' | 'updatedAt' | 'createdAt'

export const SORT_OPTIONS: SortOption[] = [
  { label: '手动排序', value: 'manual' },
  { label: '按事件时间', value: 'time' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

/** 排序方式（手动 / 名称 / 时间…）落 localStorage */
export const SORT_STORAGE_KEY = 'oc-events-sort'

/** 视图偏好（网格 / 目录）落 localStorage */
export function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-events-view') as ViewMode) ?? 'grid'
}

export function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-events-view', mode)
  }
}

/** 「起始 ~ 结束」；没有结束时间时只显示起始 */
export function formatTimeDisplay(event: Event): string {
  const start = formatEventTime(event.time)
  if (!event.endTime) return start
  const end = formatEventTime(event.endTime)
  return `${start} ~ ${end}`
}
