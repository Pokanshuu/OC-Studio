import { describe, expect, it } from 'vitest'
import {
  clampIndex,
  gridIndex,
  idsInRange,
  indexOfId,
  listKeyAction,
  moveIndex,
  pruneIds,
  rangeBetween,
  sameIdSet,
} from '@/lib/use-list-navigation'

/**
 * 列表选中模型的纯逻辑。
 *
 * 重点不是「算得对」，而是**键盘的方向键只移动焦点**：
 * 卡片 / 行本体上的 ArrowDown 绝不能落到「打开」或「起拖」上。
 */
describe('use-list-navigation · 下标移动', () => {
  it('clampIndex 夹在两端', () => {
    expect(clampIndex(-3, 5)).toBe(0)
    expect(clampIndex(9, 5)).toBe(4)
    expect(clampIndex(2, 5)).toBe(2)
    expect(clampIndex(0, 0)).toBe(0)
  })

  it('行视图上下不环绕', () => {
    expect(moveIndex(0, -1, 5)).toBe(0)
    expect(moveIndex(4, 1, 5)).toBe(4)
    expect(moveIndex(2, -1, 5)).toBe(1)
  })

  it('网格：左右在本行内、上下按列数跳', () => {
    // 4 列，10 项 → 两行半
    expect(gridIndex(0, 'ArrowRight', 4, 10)).toBe(1)
    expect(gridIndex(0, 'ArrowLeft', 4, 10)).toBe(0)
    expect(gridIndex(1, 'ArrowDown', 4, 10)).toBe(5)
    expect(gridIndex(9, 'ArrowDown', 4, 10)).toBe(9)
    expect(gridIndex(5, 'ArrowUp', 4, 10)).toBe(1)
    expect(gridIndex(9, 'ArrowRight', 4, 10)).toBe(9)
  })

  it('网格：列数为 1 时退化成行视图', () => {
    expect(gridIndex(2, 'ArrowDown', 1, 5)).toBe(3)
    expect(gridIndex(2, 'ArrowUp', 1, 5)).toBe(1)
  })
})

describe('use-list-navigation · 范围选择', () => {
  it('正反方向都给出升序区间', () => {
    expect(rangeBetween(2, 5)).toEqual([2, 5])
    expect(rangeBetween(5, 2)).toEqual([2, 5])
  })

  it('按区间取 id 集合（含两端）', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect([...idsInRange(ids, 1, 3)]).toEqual(['b', 'c', 'd'])
    expect([...idsInRange(ids, 3, 1)]).toEqual(['b', 'c', 'd'])
    expect([...idsInRange(ids, 0, 0)]).toEqual(['a'])
  })
})

describe('use-list-navigation · 剔除与判等', () => {
  it('筛选后把不存在的选中项剔掉', () => {
    const next = pruneIds(new Set([1, 2, 3]), [3, 4, 5])
    expect([...next]).toEqual([3])
  })

  it('ids 全没了就清空', () => {
    expect(pruneIds(new Set([1, 2]), []).size).toBe(0)
  })

  it('sameIdSet 按元素判等（顺序无关）', () => {
    expect(sameIdSet(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(sameIdSet(new Set([1, 2]), new Set([1]))).toBe(false)
    expect(sameIdSet(new Set([1]), new Set([2]))).toBe(false)
  })

  it('indexOfId 找不到返回 -1', () => {
    expect(indexOfId([1, 2, 3], 2)).toBe(1)
    expect(indexOfId([1, 2, 3], 9)).toBe(-1)
    expect(indexOfId([1, 2, 3], null)).toBe(-1)
  })
})

describe('use-list-navigation · 键盘动作', () => {
  const base = { index: 1, count: 4, columns: 1 }

  it('方向键只移动焦点，不是打开 / 删除', () => {
    expect(listKeyAction('ArrowDown', base)).toEqual({ type: 'focus', index: 2 })
    expect(listKeyAction('ArrowUp', base)).toEqual({ type: 'focus', index: 0 })
  })

  it('行视图的左右键不做事（网格才移动）', () => {
    expect(listKeyAction('ArrowLeft', base)).toBeNull()
    expect(listKeyAction('ArrowRight', base)).toBeNull()
    expect(listKeyAction('ArrowRight', { ...base, columns: 3, grid: true })).toEqual({ type: 'focus', index: 2 })
  })

  it('Home / End 到首尾', () => {
    expect(listKeyAction('Home', base)).toEqual({ type: 'focus', index: 0 })
    expect(listKeyAction('End', base)).toEqual({ type: 'focus', index: 3 })
  })

  it('Enter 打开、Delete 删除、F2 改名、Esc 清空选中', () => {
    expect(listKeyAction('Enter', base)).toEqual({ type: 'open' })
    expect(listKeyAction('Delete', base)).toEqual({ type: 'delete' })
    expect(listKeyAction('Backspace', base)).toEqual({ type: 'delete' })
    expect(listKeyAction('F2', base)).toEqual({ type: 'rename' })
    expect(listKeyAction('Escape', base)).toEqual({ type: 'clear' })
  })

  it('空格不归列表管（那是拖拽手柄的起拖键，卡片本体不能抢）', () => {
    expect(listKeyAction(' ', base)).toBeNull()
    expect(listKeyAction('Spacebar', base)).toBeNull()
  })

  it('空列表什么也不做', () => {
    expect(listKeyAction('ArrowDown', { index: -1, count: 0, columns: 1 })).toBeNull()
    expect(listKeyAction('Enter', { index: -1, count: 0, columns: 1 })).toBeNull()
  })

  it('还没有焦点项时 Enter 不打开', () => {
    expect(listKeyAction('Enter', { index: -1, count: 4, columns: 1 })).toBeNull()
  })
})
