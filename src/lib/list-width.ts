/** 编辑器 / 相册左侧列表栏宽度唯一源：默认以相册 200px 为准，可调 0.8–1.2x。 */
export const DEFAULT_LIST_WIDTH = 200
export const LIST_WIDTH_MIN = 160
export const LIST_WIDTH_MAX = 240
export const LIST_WIDTH_STORAGE_KEY = 'oc-list-width'

export function clampListWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_LIST_WIDTH
  return Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, Math.round(width)))
}

export function readListWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_LIST_WIDTH
  try {
    const raw = window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY)
    if (!raw) return DEFAULT_LIST_WIDTH
    return clampListWidth(Number(raw))
  } catch {
    return DEFAULT_LIST_WIDTH
  }
}
