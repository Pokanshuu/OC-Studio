import { describe, expect, it, vi } from 'vitest'

/**
 * `@` / `[[` 补全的数据入口：**类型过滤必须发生在排序与截断之前**。
 *
 * 旧实现先合并排序、取前 N 条，再由调用方按类型挑选：
 * 名字排序靠后的整类实体会全部缺失（输入 `[[` 后词条列表为空即由此产生）。
 */

const h = vi.hoisted(() => ({
  characters: Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    name: `阿角色${index}`,
    aliases: [],
  })),
  worldEntries: Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    title: `作词条${index}`,
    aliases: [],
  })),
}))

vi.mock('@/lib/db', () => {
  const table = (rows: unknown[]) => ({ orderBy: () => ({ toArray: async () => rows }) })
  return {
    db: {
      characters: table(h.characters),
      worldEntries: table(h.worldEntries),
      events: table([]),
      countries: table([]),
    },
  }
})

import { searchReferableEntities } from '@/lib/reference-registry'

describe('searchReferableEntities', () => {
  it('词条不会被角色挤掉：类型过滤先于截断', async () => {
    const result = await searchReferableEntities('', { types: ['world'], limit: 50 })
    expect(result).toHaveLength(12)
    expect(result.every((item) => item.type === 'world')).toBe(true)
  })

  it('@ 引用只取角色 / 事件 / 国家', async () => {
    const result = await searchReferableEntities('', {
      types: ['character', 'event', 'country'],
    })
    expect(result).toHaveLength(60)
    expect(result.some((item) => item.type === 'world')).toBe(false)
  })

  it('词条同样按拼音首字母命中', async () => {
    const result = await searchReferableEntities('zc', { types: ['world'] })
    expect(result).toHaveLength(12)
    expect(result.every((item) => item.name.startsWith('作词条'))).toBe(true)
  })
})
