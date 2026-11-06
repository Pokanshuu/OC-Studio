/**
 * 时间字段的解析 / 拼装 —— **唯一实现**。
 *
 * 事件（`events.time` / `endTime`）与词条（`worldEntries.time` / `endTime`）用的是
 * 同一种落盘形态：`YYYY-MM-DD`，年月日都可缺（只有年、只有年月也合法，负年份表示「前」）。
 * 以前这三段逻辑住在 `features/events/utils.ts`，词条接时间组件时若复制一份，
 * 两边迟早会出现「事件能解析、词条解析不出来」的漂移。纯函数，脚本也能直接读。
 */

export interface ParsedTime {
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
