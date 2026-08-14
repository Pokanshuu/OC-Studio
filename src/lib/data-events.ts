'use client'

/**
 * 跨模块数据变更通知事件名。
 * 统一使用本常量，避免散落在各 feature 里的 'data-updated' 魔法字符串。
 */
export const DATA_UPDATED_EVENT = 'data-updated'

/** 广播"数据已更新"，触发各列表 hook 刷新。 */
export function notifyDataUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DATA_UPDATED_EVENT))
}
