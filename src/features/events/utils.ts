import type { Event } from '@/types'
import { compareManual } from '@/lib/sort-manual'
import { normalizeTime, parseTime } from '@/lib/time-field'

/**
 * 时间三段解析 / 拼装 / 归一化已迁到 `lib/time-field.ts`（事件与词条共用）。
 * 这里保留导出，现有调用点不用改。
 */
export { parseTime, assembleTime, normalizeTime } from '@/lib/time-field'

export type SortKey = 'manual' | 'time' | 'updatedAt' | 'createdAt'

export function sortEvents(events: Event[], key: SortKey): Event[] {
  const sorted = [...events]
  sorted.sort((a, b) => {
    if (key === 'manual') return compareManual(a, b)
    if (key === 'time') {
      const aYear = parseYear(a.time)
      const bYear = parseYear(b.time)
      const aEmpty = aYear === null
      const bEmpty = bYear === null
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      if (aYear !== bYear) return aYear - bYear
      const aTime = normalizeTime(a.time)
      const bTime = normalizeTime(b.time)
      return aTime.localeCompare(bTime)
    }
    return Number(b[key]) - Number(a[key])
  })
  return sorted
}

export function addOneYear(time: string): string {
  if (!time) return ''
  const negative = time.startsWith('-')
  const clean = negative ? time.slice(1) : time
  const parts = clean.split('-')
  const year = (negative ? '-' : '') + (parts[0] ?? '')
  const month = parts[1] ?? ''
  const day = parts[2] ?? ''
  const newYear = String(parseInt(year, 10) + 1)
  let result = newYear
  if (month) result += '-' + month.padStart(2, '0')
  if (month && day) result += '-' + day.padStart(2, '0')
  return result
}

export function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^-?\d+/.exec(time)
  return match ? parseInt(match[0], 10) : null
}

export function formatEventTime(time: string): string {
  if (!time) return '未设定时间'

  const { year, month, day } = parseTime(time)
  const yearNum = parseInt(year, 10)

  if (!year) return '未设定时间'
  const yearLabel = yearNum < 0 ? `前${Math.abs(yearNum)}年` : `${yearNum}年`
  if (month && day) {
    return `${yearLabel}${parseInt(month, 10)}月${parseInt(day, 10)}日`
  }
  if (month) {
    return `${yearLabel}${parseInt(month, 10)}月`
  }
  return yearLabel
}

/** 相对时间统一走 `lib/relative-time`；这里保留导出，事件列表的既有 import 不用改 */
export { formatRelativeTime } from '@/lib/relative-time'
