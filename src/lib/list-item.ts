'use client'

import type { ListItemHandlers } from './use-list-navigation'

/**
 * 把 `use-list-navigation` 的 itemProps 变成「行 / 卡片的根节点属性」。
 *
 * 没接选中模型时（移动端、画廊上半栏、插件自己的列表）退回原来的形态：
 * `role="button"` + `tabIndex={0}` + 调用方自己的 onClick / onKeyDown。
 * 这样列表项组件不用分两套，也不用到处写三元。
 */
export function listRowProps(
  nav: ListItemHandlers | undefined,
  fallback: {
    onClick: () => void
    onKeyDown?: (event: React.KeyboardEvent) => void
  },
): Record<string, unknown> {
  if (nav) return { role: 'option', ...nav }
  return {
    role: 'button',
    tabIndex: 0,
    onClick: fallback.onClick,
    onKeyDown: fallback.onKeyDown,
  }
}

/** 选中态那一圈内线：接了选中模型、且这一项在选中集里时才加 */
export function listRowClass(nav: ListItemHandlers | undefined, base: string, selected: string): string {
  return nav?.['data-selected'] === 'true' ? `${base} ${selected}` : base
}
