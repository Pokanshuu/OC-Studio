'use client'

import { useEffect, type RefObject } from 'react'

/** 菜单项的选择器：只有 `role="menuitem"` 才算（分隔线 / 分组标题自然被跳过） */
export const MENU_ITEM_SELECTOR = '[role="menuitem"]'

/**
 * 在可用项之间循环移动（首尾相接）。
 * 纯函数：`tests/menu-keyboard.test.ts` 盯着它 —— 菜单里「上下到底再按一下」不该卡住。
 */
export function cycleIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1
  if (current < 0) return delta > 0 ? 0 : count - 1
  return ((current + delta) % count + count) % count
}

/**
 * 自绘菜单的键盘导航（**唯一实现**）。
 *
 * 项目里按坐标弹的菜单有五套实现（编辑器右键 / 输入框右键 / 媒体右键 / 块类型 / 筛选下拉），
 * 视觉早就统一到 `MENU`，但行为各写各的：多数打开后不能用方向键选、不能 Enter 确认 ——
 * 键盘用户只能拿鼠标。
 *
 * 这里按 **DOM** 驱动而不是按数据驱动：五套菜单的条目结构各不相同（有的带子菜单、
 * 有的有自己的输入框），传一份 items 数组等于让每个调用点再维护一遍。约定只有一条：
 * 菜单项写 `role="menuitem"`。分隔线 / 分组标题不带这个 role，自然被跳过。
 *
 * 行为（与原生菜单一致）：
 * - 打开后焦点落在第一项
 * - ↑/↓ 在可用项之间移动（首尾循环），Home / End 到首尾
 * - Enter / 空格 = 点一下当前项
 * - Esc = 关闭，并把焦点还给**打开前的那个元素**
 * - 有子菜单的项：→ / Enter 打开它（由 Base UI 或调用方自己的子菜单处理），← 返回
 *
 * `onClose` 必须是稳定引用（`useCallback`），否则每次渲染都会重挂监听。
 */
export function useMenuKeyboard(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return
    // 打开前的焦点：关闭时还给它（不然焦点会掉到 body，键盘用户直接「迷路」）
    const previous = document.activeElement as HTMLElement | null

    const items = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
      )

    const focusAt = (index: number): void => {
      const list = items()
      if (list.length === 0) return
      list[cycleIndex(index, 0, list.length)]?.focus()
    }

    const currentIndex = (): number => {
      const list = items()
      const active = document.activeElement as HTMLElement | null
      return active ? list.indexOf(active) : -1
    }

    // 初始焦点：第一项（菜单里如果自带输入框，调用方会自己抢焦点，这里不强制）
    const first = items()[0]
    if (first && !container.querySelector('input, textarea')) first.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      const index = currentIndex()
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          focusAt(index < 0 ? 0 : index + 1)
          return
        case 'ArrowUp':
          event.preventDefault()
          focusAt(index < 0 ? 0 : index - 1)
          return
        case 'Home':
          event.preventDefault()
          focusAt(0)
          return
        case 'End':
          event.preventDefault()
          focusAt(items().length - 1)
          return
        case 'Enter':
        case ' ': {
          if (index < 0) return
          // 输入框里的回车 / 空格是打字，不是「确认菜单项」
          const target = event.target as HTMLElement | null
          if (target && target.closest('input, textarea')) return
          event.preventDefault()
          items()[index]?.click()
          return
        }
        case 'Escape':
          event.preventDefault()
          onClose()
          return
        default:
          return
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous && previous.isConnected) previous.focus()
    }
  }, [containerRef, onClose, enabled])
}
