import { describe, expect, it } from 'vitest'
import { buildEntryTree } from '@/lib/world-tree'
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

/** 树压成「父 → 子标题列表」，方便断言层级与顺序 */
function shape(nodes: ReturnType<typeof buildEntryTree>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const walk = (list: typeof nodes, parent: string) => {
    out[parent] = list.map((node) => node.entry.title)
    for (const node of list) walk(node.children, node.entry.title)
  }
  walk(nodes, 'root')
  return out
}

describe('buildEntryTree', () => {
  it('按 parentId 组树，并按 order 排序', () => {
    const tree = buildEntryTree([
      entry(1, null, 1, '第二根'),
      entry(2, null, 0, '第一根'),
      entry(3, 2, 1, '子 B'),
      entry(4, 2, 0, '子 A'),
    ])
    expect(shape(tree)).toEqual({
      root: ['第一根', '第二根'],
      第一根: ['子 A', '子 B'],
      第二根: [],
      '子 A': [],
      '子 B': [],
    })
  })

  it('order 相同按标题（zh-Hans）排，结果稳定', () => {
    const tree = buildEntryTree([
      entry(1, null, 0, '乙'),
      entry(2, null, 0, '甲'),
      entry(3, null, 0, '丙'),
    ])
    // 拼音序：丙（b）→ 甲（j）→ 乙（y）
    expect(shape(tree).root).toEqual(['丙', '甲', '乙'])
  })

  it('父级缺失（数据半损坏）时该条当根，不消失', () => {
    const tree = buildEntryTree([entry(1, null, 0, '根'), entry(2, 999, 1, '孤儿')])
    expect(shape(tree).root).toEqual(['根', '孤儿'])
    expect(shape(tree).孤儿).toEqual([])
  })

  it('多层嵌套逐层排序', () => {
    const tree = buildEntryTree([
      entry(1, null, 0, 'A'),
      entry(2, 1, 0, 'A-1'),
      entry(3, 2, 0, 'A-1-a'),
      entry(4, 1, 1, 'A-2'),
    ])
    expect(shape(tree)).toMatchObject({
      root: ['A'],
      A: ['A-1', 'A-2'],
      'A-1': ['A-1-a'],
    })
  })

  it('空输入返回空树', () => {
    expect(buildEntryTree([])).toEqual([])
  })
})
