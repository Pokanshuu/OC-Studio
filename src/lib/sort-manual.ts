/**
 * 「手动排序」的唯一比较器。
 *
 * 顺序存在实体自己的 `order` 上（落盘到 frontmatter 的 `order`），没有 order 的
 * 一律排在末尾、彼此按创建时间升序 —— 这样老数据第一次打开不会乱跳，
 * 拖过之后所有人都会拿到 0..n 的整数。
 */
export interface ManualOrderItem {
  id: number
  order?: number
  createdAt: number
}

export function compareManual(a: ManualOrderItem, b: ManualOrderItem): number {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER
  const bo = b.order ?? Number.MAX_SAFE_INTEGER
  if (ao !== bo) return ao - bo
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  return a.id - b.id
}

/** 排序方式也是视图偏好：跟着列表一起记住（和「网格 / 目录」一个待遇） */
export function readSortKey<T extends string>(storageKey: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const saved = localStorage.getItem(storageKey)
  return (saved as T | null) ?? fallback
}

export function writeSortKey(storageKey: string, value: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(storageKey, value)
}
