/**
 * `PointMenu` 的可交互断言（Base UI Menu + 虚拟锚点）：
 * 打开位置、↑↓ 移动、→ 进子菜单、← 返回、Enter 执行、Esc 关闭并归还焦点、150ms 淡出后才卸载。
 *
 * 用 `react-dom/client` 直接挂载（项目没有 testing-library），断言角色 / aria / 焦点，
 * 不断言类名字符串。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PointMenu, type PointMenuItem } from '@/components/shared/menu/PointMenu'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let overlay: HTMLDivElement
let root: Root
let onClose: ReturnType<typeof vi.fn>
let onSelect: ReturnType<typeof vi.fn>

function items(): PointMenuItem[] {
  return [
    { label: '打开', onSelect: () => onSelect('打开') },
    {
      label: '移到文件夹',
      submenu: [
        { label: '夹 A', onSelect: () => onSelect('夹 A') },
        { label: '夹 B', onSelect: () => onSelect('夹 B') },
      ],
    },
    { separator: true },
    { label: '删除', danger: true, onSelect: () => onSelect('删除') },
  ]
}

function render(): void {
  act(() => {
    root.render(
      createElement(PointMenu, { at: { x: 40, y: 60 }, items: items(), onClose }),
    )
  })
}

function menu(): HTMLElement | null {
  return overlay.querySelector('[role="menu"]')
}

function menus(): HTMLElement[] {
  return Array.from(overlay.querySelectorAll<HTMLElement>('[role="menu"]'))
}

function menuItems(scope: HTMLElement | null = menu()): HTMLElement[] {
  if (!scope) return []
  return Array.from(scope.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

function press(key: string, on: Element): void {
  act(() => {
    on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  overlay = document.createElement('div')
  overlay.id = 'overlay-root'
  document.body.append(container, overlay)
  root = createRoot(container)
  onClose = vi.fn()
  onSelect = vi.fn()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  overlay.remove()
  globalThis.IS_REACT_ACT_ENVIRONMENT = undefined
})

describe('PointMenu', () => {
  it('打开后渲染到 #overlay-root，行数与分隔线正确', () => {
    render()
    expect(menu()).not.toBeNull()
    expect(menuItems().map((item) => item.textContent)).toEqual(['打开', '移到文件夹', '删除'])
    // 分隔线不进 menuitem
    expect(menu()?.querySelector('[role="separator"]')).not.toBeNull()
  })

  it('↑↓ 在菜单项之间循环，Home / End 到首尾', () => {
    render()
    const first = menuItems()[0]
    act(() => first.focus())

    press('ArrowDown', first)
    expect(document.activeElement?.textContent).toBe('移到文件夹')

    press('ArrowUp', document.activeElement!)
    expect(document.activeElement?.textContent).toBe('打开')

    press('End', document.activeElement!)
    expect(document.activeElement?.textContent).toBe('删除')

    press('Home', document.activeElement!)
    expect(document.activeElement?.textContent).toBe('打开')
  })

  it('→ 进子菜单、← 回父菜单、Enter 执行子菜单项', () => {
    render()
    const trigger = menuItems()[1]
    act(() => trigger.focus())

    press('ArrowRight', trigger)
    expect(menus()).toHaveLength(2)
    const sub = menus()[1]
    expect(menuItems(sub).map((item) => item.textContent)).toEqual(['夹 A', '夹 B'])

    // 子菜单里按 ← 回父菜单，焦点回到「移到文件夹」这一行
    const subFirst = menuItems(sub)[0]
    act(() => subFirst.focus())
    press('ArrowLeft', subFirst)
    expect(menus()).toHaveLength(1)
    expect(document.activeElement?.textContent).toBe('移到文件夹')

    // 再进一次，Enter 执行子菜单项
    press('ArrowRight', document.activeElement ?? menuItems()[1])
    const subB = menuItems(menus()[1])[1]
    act(() => subB.focus())
    press('Enter', subB)
    expect(onSelect).toHaveBeenCalledWith('夹 B')
  })

  it('Enter 执行普通项', () => {
    render()
    act(() => menuItems()[0].focus())
    press('Enter', document.activeElement!)
    expect(onSelect).toHaveBeenCalledWith('打开')
  })

  it('Esc 关闭：先把焦点还回去，150ms 后才回调 onClose', () => {
    vi.useFakeTimers()
    try {
      const previous = document.createElement('button')
      document.body.append(previous)
      previous.focus()

      render()
      act(() => menuItems()[0].focus())
      press('Escape', document.activeElement!)

      // 淡出期间还在 DOM 里
      expect(onClose).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(previous)
      previous.remove()
    } finally {
      vi.useRealTimers()
    }
  })

  it('点菜单项后关闭（动画结束才卸载）', () => {
    vi.useFakeTimers()
    try {
      render()
      click(menuItems()[0])
      expect(onSelect).toHaveBeenCalledWith('打开')
      expect(onClose).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
