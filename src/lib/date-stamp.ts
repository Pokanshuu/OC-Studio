/**
 * 导出文件名里的日期戳 —— **本地时区**。
 *
 * 为什么单独一个模块：以前导出的文件名有两种写法 ——
 * 导出中心那几个面板各自用 `getFullYear/getMonth/getDate`（本地，对的），
 * 而 `lib/export/download.ts` 与 `.ocbak` 走的是 `toISOString().slice(0, 10)`（**UTC**）。
 * 在 UTC+8 的凌晨（本地 00:00–08:00），UTC 还是前一天，文件名就会写成「昨天」——
 * 同一个应用、同一天导出，名字对不上；从日志找备份时尤其难受。
 *
 * 一律用这个：本地 `YYYY-MM-DD`。
 */
export function localDateStamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 本地 `YYYYMMDD-HHMMSS`（需要精确到秒的文件名，如关系图 / 地图导出） */
export function localDateTimeStamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${localDateStamp(date).replace(/-/g, '')}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}
