/**
 * 「筛选」分组菜单的可交互断言：单选高亮、键盘、Esc、点外部、焦点归还。
 *
 * 用 `react-dom/client` 直接挂载（项目没有 testing-library），断言的是
 * **角色 / aria 状态 / 菜单里真实渲染出的选项**，不是类名字符串。
 *
 * 2026-11-15：组件换成 Base UI Menu（`Menu.RadioGroup`）后，关闭动画 / 焦点归还是
 * 库在下一帧做的，所以「关闭之后」的断言统一先 `await flush()` 一次。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GroupModeMenu, type GroupModeOption } from '@/components/shared/GroupModeMenu'
import type { CharacterGroupMode } from '@/lib/list-grouping-preference'

const OPTIONS: GroupModeOption<CharacterGroupMode>[] = [
  { value: 'country', label: '按国家' },
  { value: 'folder', label: '按文件夹' },
]

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let overlay: HTMLDivElement
let root: Root

function renderMenu(
  value: CharacterGroupMode,
  onChange: (next: CharacterGroupMode) => void,
): void {
  act(() => {
    root.render(createElement(GroupModeMenu<CharacterGroupMode>, { value, onChange, options: OPTIONS }))
  })
}

function trigger(): HTMLButtonElement {
  const button = container.querySelector('button')
  if (!button) throw new Error('找不到筛选触发按钮')
  return button as HTMLButtonElement
}

function menu(): HTMLElement | null {
  return overlay.querySelector('[role="menu"]')
}

function optionButtons(): HTMLElement[] {
  return Array.from(overlay.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function press(key: string, on: Element): void {
  act(() => {
    on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/** 库的关闭 / 焦点归还在动画帧里做，等一帧 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  overlay = document.createElement('div')
  overlay.id = 'overlay-root'
  document.body.append(container, overlay)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  overlay.remove()
  globalThis.IS_REACT_ACT_ENVIRONMENT = undefined
})

describe('GroupModeMenu', () => {
  it('触发按钮的无障碍名称是「筛选与分组」；默认关闭', () => {
    renderMenu('country', vi.fn())
    expect(trigger().getAttribute('aria-label')).toBe('筛选与分组')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(menu()).toBeNull()
  })

  it('打开后菜单标题「分组方式」，两个选项单选、当前项打勾', () => {
    renderMenu('country', vi.fn())
    click(trigger())

    expect(menu()).not.toBeNull()
    expect(menu()?.textContent).toContain('分组方式')
    const items = optionButtons()
    expect(items.map((item) => item.textContent?.replace(/\s/g, ''))).toEqual(['按国家', '按文件夹'])
    expect(items[0].getAttribute('aria-checked')).toBe('true')
    expect(items[1].getAttribute('aria-checked')).toBe('false')
    // 单选标记只出现在当前项
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('选择「按文件夹」回调一次并关闭，焦点回到触发按钮', async () => {
    const onChange = vi.fn()
    renderMenu('country', onChange)
    click(trigger())

    const folder = optionButtons().find((item) => item.textContent?.includes('按文件夹'))
    if (!folder) throw new Error('找不到「按文件夹」')
    click(folder)
    await flush()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('folder')
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('Esc 关闭并把焦点还给触发按钮', async () => {
    renderMenu('folder', vi.fn())
    click(trigger())
    expect(optionButtons()[1].getAttribute('aria-checked')).toBe('true')

    press('Escape', optionButtons()[1])
    await flush()
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('键盘：↓ 打开并聚焦到选项上，↑↓ 在选项之间移动', async () => {
    renderMenu('folder', vi.fn())
    press('ArrowDown', trigger())
    await flush()

    expect(menu()).not.toBeNull()
    const start = document.activeElement as HTMLElement | null
    expect(start?.closest('[role="menu"]')).toBe(menu())

    press('ArrowDown', start!)
    const next = document.activeElement
    expect(next).not.toBe(start)
    expect((next as HTMLElement).closest('[role="menu"]')).toBe(menu())

    press('ArrowUp', next!)
    expect(document.activeElement).toBe(start)
  })

  it('点外部关闭，不改变选择', async () => {
    const onChange = vi.fn()
    renderMenu('country', onChange)
    click(trigger())
    expect(menu()).not.toBeNull()

    act(() => {
      const event = new PointerEvent('pointerdown', { bubbles: true })
      document.body.dispatchEvent(event)
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    await flush()
    expect(menu()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('新选中值重渲染后勾选跟着走', () => {
    renderMenu('country', vi.fn())
    click(trigger())
    click(optionButtons()[1])

    renderMenu('folder', vi.fn())
    click(trigger())
    expect(optionButtons()[0].getAttribute('aria-checked')).toBe('false')
    expect(optionButtons()[1].getAttribute('aria-checked')).toBe('true')
  })
})
