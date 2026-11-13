import { describe, expect, it } from 'vitest'
import { listWorldFolders } from '@/features/categories/folders'
import type { WorldEntry } from '@/types'

function entry(id: number, folder?: string, category = '宠物'): WorldEntry {
  return {
    id,
    title: `条目 ${id}`,
    content: '',
    category,
    folder,
    parentId: null,
    order: 0,
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

describe('listWorldFolders', () => {
  it('按分类统计，别的分类的条目不混进来', () => {
    const result = listWorldFolders(
      [entry(1, '甲'), entry(2, '甲'), entry(3), entry(4, '乙', '武器')],
      '宠物',
      [],
    )
    expect(result.ungrouped).toBe(1)
    expect(result.folders).toEqual([{ name: '甲', count: 2 }])
  })

  it('空文件夹靠清单留住（count 0）', () => {
    const result = listWorldFolders([entry(1)], '宠物', ['空夹'])
    expect(result.folders).toEqual([{ name: '空夹', count: 0 }])
    expect(result.ungrouped).toBe(1)
  })

  it('清单与条目上的名字合并去重，按 zh-Hans 排序', () => {
    const result = listWorldFolders(
      [entry(1, '乙'), entry(2, '甲')],
      '宠物',
      ['乙', '丙'],
    )
    expect(result.folders.map((f) => f.name)).toEqual(['丙', '甲', '乙'])
  })

  it('空名字 / 空白不当文件夹', () => {
    const result = listWorldFolders([entry(1, '   ')], '宠物', ['  '])
    expect(result.folders).toEqual([])
    expect(result.ungrouped).toBe(1)
  })
})
