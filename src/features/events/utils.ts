import type { Event } from '@/types'

export type SortKey = 'time' | 'updatedAt' | 'createdAt'

interface ParsedTime {
  year: string
  month: string
  day: string
}

export function parseTime(time: string): ParsedTime {
  if (!time) return { year: '', month: '', day: '' }

  const parts = time.split('-')
  return {
    year: parts[0] ?? '',
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

  const parts = time.split('-')
  const year = (parts[0] ?? '').padStart(4, '0')
  const month = (parts[1] ?? '00').padStart(2, '0')
  const day = (parts[2] ?? '00').padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function sortEvents(events: Event[], key: SortKey): Event[] {
  const sorted = [...events]
  sorted.sort((a, b) => {
    if (key === 'time') {
      const aNorm = normalizeTime(a.time)
      const bNorm = normalizeTime(b.time)
      const aEmpty = !aNorm
      const bEmpty = !bNorm
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      return aNorm.localeCompare(bNorm)
    }
    return Number(b[key]) - Number(a[key])
  })
  return sorted
}

export function formatEventTime(time: string): string {
  if (!time) return '未设定时间'

  const { year, month, day } = parseTime(time)

  if (!year) return '未设定时间'
  if (month && day) {
    return `${parseInt(year, 10)}年${parseInt(month, 10)}月${parseInt(day, 10)}日`
  }
  if (month) {
    return `${parseInt(year, 10)}年${parseInt(month, 10)}月`
  }
  return `${parseInt(year, 10)}年`
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
