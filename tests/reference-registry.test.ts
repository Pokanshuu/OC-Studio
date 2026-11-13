import { describe, expect, it } from 'vitest'
import { rankReferableEntities, type ReferableEntity } from '@/lib/reference-registry'

function entity(name: string, keywords: string[] = [], type = 'character'): ReferableEntity {
  return { type, id: name, name, keywords }
}

describe('rankReferableEntities', () => {
  it('名字前缀 > 别名前缀 > 名字包含 > 别名包含', () => {
    const entities = [
      entity('小菠菜'), // 名字包含
      entity('菠菜', ['菜菜']), // 名字前缀
      entity('大鱼', ['别名菠菜']), // 别名包含
      entity('白菜', ['菠菜']), // 别名前缀
    ]
    expect(rankReferableEntities(entities, '菠菜').map((e) => e.name)).toEqual([
      '菠菜',
      '白菜',
      '小菠菜',
      '大鱼',
    ])
  })

  it('不再按类型截断：20 个角色 + 20 个词条都能返回', () => {
    const entities = [
      ...Array.from({ length: 20 }, (_, i) => entity(`角色${i}`, [], 'character')),
      ...Array.from({ length: 20 }, (_, i) => entity(`词条${i}`, [], 'world')),
    ]
    expect(rankReferableEntities(entities, '')).toHaveLength(40)
  })

  it('查询为空时保留全部（上限 50），顺序按 zh-Hans 名字', () => {
    const entities = Array.from({ length: 60 }, (_, i) => entity(`条目${i}`))
    const result = rankReferableEntities(entities, '')
    expect(result).toHaveLength(50)
    expect(result[0].name).toBe('条目0')
  })

  it('大小写不敏感，别名也参与', () => {
    const entities = [entity('Alice', ['ali']), entity('Bob')]
    expect(rankReferableEntities(entities, 'ALI').map((e) => e.name)).toEqual(['Alice'])
  })

  it('没有命中返回空数组', () => {
    expect(rankReferableEntities([entity('菠菜')], 'xyz')).toEqual([])
  })
})
