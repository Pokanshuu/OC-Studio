/**
 * 相对时间文案（列表行 / 最近更新共用）。
 *
 * 口径统一为「刚刚 / N分钟前 / N小时前 / N天前 / X月X日」，不要在各自的列表里
 * 再抄一份 —— 事件行与分类条目行必须说同一种时间。
 */
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
