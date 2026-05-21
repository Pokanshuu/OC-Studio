import type { Event } from '@/types'

export type SortKey = 'time' | 'updatedAt' | 'createdAt'

interface ParsedTime {
  year: string
  month: string
  day: string
}

export function parseTime(time: string): ParsedTime {
  if (!time) return { year: '', month: '', day: '' }

  const negative = time.startsWith('-')
  const clean = negative ? time.slice(1) : time
  const parts = clean.split('-')
  return {
    year: (negative ? '-' : '') + (parts[0] ?? ''),
    month: parts[1] ?? '',
    day: parts[2] ?? '',
  }
}

export function assembleTime(year: string, month: string, day: string): string {
  if (!year) return ''

  let result = year
  if (month) {
    result += '-' + month.padStart(2, '0')
  }
  if (month && day) {
    result += '-' + day.padStart(2, '0')
  }

  return result
}

export function normalizeTime(time: string): string {
  if (!time) return ''

  const negative = time.startsWith('-')
  const clean = negative ? time.slice(1) : time
  const parts = clean.split('-')
  let year = (parts[0] ?? '').padStart(4, '0')
  if (negative) year = '-' + year
  const month = (parts[1] ?? '00').padStart(2, '0')
  const day = (parts[2] ?? '00').padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function sortEvents(events: Event[], key: SortKey): Event[] {
  const sorted = [...events]
  sorted.sort((a, b) => {
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

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 0) return '刚刚'

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
