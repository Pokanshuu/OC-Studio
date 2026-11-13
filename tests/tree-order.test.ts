import { describe, expect, it } from 'vitest'
import { computeReorder } from '@/lib/tree-order'
import type { WorldEntry } from '@/types'

function entry(id: number, parentId: number | null, order: number, title = `条目 ${id}`): WorldEntry {
  return {
    id,
    title,
    content: '',
    category: '',
    parentId,
    order,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
  }
}

/** 结果转成「id → { parentId, order }」，断言时不用关心返回顺序 */
function layout(updates: ReturnType<typeof computeReorder>): Map<number, { parentId: number | null; order: number }> {
  return new Map(updates.map((u) => [u.id, { parentId: u.parentId, order: u.order }]))
}

describe('computeReorder', () => {
  it('同层拖到某人前面：两层都重排，且顺序连续', () => {
    const entries = [entry(1, null, 0, 'A'), entry(2, null, 1, 'B'), entry(3, null, 2, 'C')]
    const result = layout(computeReorder(entries, 3, null, 1))
    expect(result.get(3)).toEqual({ parentId: null, order: 0 })
    expect(result.get(1)).toEqual({ parentId: null, order: 1 })
    expect(result.get(2)).toEqual({ parentId: null, order: 2 })
  })

  it('拖到末尾：insertBeforeId 为 null', () => {
    const entries = [entry(1, null, 0), entry(2, null, 1), entry(3, null, 2)]
    const result = layout(computeReorder(entries, 1, null, null))
    expect(result.get(2)).toEqual({ parentId: null, order: 0 })
    expect(result.get(3)).toEqual({ parentId: null, order: 1 })
    expect(result.get(1)).toEqual({ parentId: null, order: 2 })
  })

  it('跨父级：旧层补空号，新层按落点插入', () => {
    const entries = [
      entry(1, null, 0, '根'),
      entry(2, 1, 0, '子 A'),
      entry(3, 1, 1, '子 B'),
      entry(4, 1, 2, '子 C'),
      entry(5, 1, 3, '子 D'),
    ]
    // 把「子 A」拖到「子 C」前面；同层排序按 order，所以「子 B」(order 1) 仍在前
    const result = layout(computeReorder(entries, 2, 1, 4))
    expect(result.get(3)).toEqual({ parentId: 1, order: 0 })
    expect(result.get(2)).toEqual({ parentId: 1, order: 1 })
    expect(result.get(4)).toEqual({ parentId: 1, order: 2 })
    expect(result.get(5)).toEqual({ parentId: 1, order: 3 })
  })

  it('旧层留下的洞会被重新编号', () => {
    const entries = [
      entry(1, null, 0),
      entry(2, null, 1),
      entry(3, null, 2),
      entry(4, null, 3),
      entry(10, 1, 0, '新家'),
    ]
    const result = layout(computeReorder(entries, 3, 1, null))
    // 根层剩 1 / 2 / 4，按原 order 重排成 0 / 1 / 2
    expect(result.get(1)).toEqual({ parentId: null, order: 0 })
    expect(result.get(2)).toEqual({ parentId: null, order: 1 })
    expect(result.get(4)).toEqual({ parentId: null, order: 2 })
    expect(result.get(3)).toEqual({ parentId: 1, order: 1 })
  })

  it('insertBeforeId 不在新层时按「落到末尾」处理', () => {
    const entries = [entry(1, null, 0), entry(2, null, 1), entry(3, 5, 0)]
    const result = layout(computeReorder(entries, 3, null, 999))
    expect(result.get(1)).toEqual({ parentId: null, order: 0 })
    expect(result.get(2)).toEqual({ parentId: null, order: 1 })
    expect(result.get(3)).toEqual({ parentId: null, order: 2 })
  })

  it('拖的条目不存在：返回空数组，不写任何东西', () => {
    expect(computeReorder([entry(1, null, 0)], 404, null, 1)).toEqual([])
  })
})
