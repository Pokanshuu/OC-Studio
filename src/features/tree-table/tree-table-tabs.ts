/**
 * 树形表格的页签顺序（纯函数 + localStorage 读写）。
 *
 * 顺序是用户的偏好，不是数据：只存四个 key，读的时候一律过一遍
 * `normalizeTabOrder` —— 老版本 / 手改 localStorage / 以后删掉某个页签，
 * 都只会丢那一个，不会把整排页签变成空白。
 */
export type TreeTableTab = 'character' | 'event' | 'country' | 'entry'

/** 默认顺序：角色 → 事件 → 国家 → 词条（词条带层级，放最后，因为它最长） */
export const DEFAULT_TAB_ORDER: TreeTableTab[] = ['character', 'event', 'country', 'entry']

export const TAB_LABEL: Record<TreeTableTab, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  entry: '词条',
}

const TAB_ORDER_KEY = 'oc-tree-table-tab-order'

function isTab(value: unknown): value is TreeTableTab {
  return value === 'character' || value === 'event' || value === 'country' || value === 'entry'
}

/** 未知项丢掉、重复项去重、缺的按默认顺序补在后面（存着的顺序优先） */
export function normalizeTabOrder(raw: unknown): TreeTableTab[] {
  const order: TreeTableTab[] = []
  const push = (item: TreeTableTab) => {
    if (!order.includes(item)) order.push(item)
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isTab(item)) push(item)
    }
  }
  for (const item of DEFAULT_TAB_ORDER) push(item)
  return order
}

export function readTabOrder(): TreeTableTab[] {
  if (typeof window === 'undefined') return [...DEFAULT_TAB_ORDER]
  try {
    const raw = window.localStorage.getItem(TAB_ORDER_KEY)
    return normalizeTabOrder(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return [...DEFAULT_TAB_ORDER]
  }
}

export function writeTabOrder(order: TreeTableTab[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(normalizeTabOrder(order)))
  } catch {
    // 存储满 / 不可用：顺序退回默认，不值得打断操作
  }
}

/**
 * 把一个页签挪到 `insertIndex`（= 插到「原第 insertIndex 项」之前，取值 0..length）。
 * 拖放语义由调用方按指针在目标左半 / 右半算成 before / after。
 */
export function moveTab(order: TreeTableTab[], fromIndex: number, insertIndex: number): TreeTableTab[] {
  if (fromIndex < 0 || fromIndex >= order.length) return order
  const clamped = Math.min(Math.max(insertIndex, 0), order.length)
  if (clamped === fromIndex || clamped === fromIndex + 1) return order
  const next = [...order]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(clamped > fromIndex ? clamped - 1 : clamped, 0, moved)
  return next
}
