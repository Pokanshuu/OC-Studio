import { describe, expect, it } from 'vitest'
import { cycleIndex, MENU_ITEM_SELECTOR } from '@/lib/use-menu-keyboard'

/**
 * 自绘菜单的键盘导航（纯逻辑部分）。
 *
 * hook 本身是 DOM + effect，单测只钉住「在可用项之间怎么走」：
 * 菜单里上下到底再按一下必须回到另一端，而不是卡住。
 */
describe('use-menu-keyboard · 循环移动', () => {
  it('向下走到末尾回到第一项', () => {
    expect(cycleIndex(2, 1, 3)).toBe(0)
    expect(cycleIndex(0, 1, 3)).toBe(1)
  })

  it('向上走到第一项回到末尾', () => {
    expect(cycleIndex(0, -1, 3)).toBe(2)
    expect(cycleIndex(1, -1, 3)).toBe(0)
  })

  it('还没有焦点项时：向下从 0 开始、向上从末尾开始', () => {
    expect(cycleIndex(-1, 1, 4)).toBe(0)
    expect(cycleIndex(-1, -1, 4)).toBe(3)
  })

  it('空菜单返回 -1（调用方据此不发焦点）', () => {
    expect(cycleIndex(0, 1, 0)).toBe(-1)
    expect(cycleIndex(-1, -1, 0)).toBe(-1)
  })

  it('只有一项时原地不动', () => {
    expect(cycleIndex(0, 1, 1)).toBe(0)
    expect(cycleIndex(0, -1, 1)).toBe(0)
  })

  it('跳多项（Home / End 用绝对下标）', () => {
    expect(cycleIndex(4, 0, 4)).toBe(0)
    expect(cycleIndex(5, 0, 4)).toBe(1)
  })

  it('选择器只认 menuitem（分隔线 / 分组标题不进导航）', () => {
    expect(MENU_ITEM_SELECTOR).toBe('[role="menuitem"]')
  })
})
