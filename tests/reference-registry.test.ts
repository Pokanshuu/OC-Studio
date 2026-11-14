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

  it('查询为空时按 zh-Hans 名字排序，超过上限才截断', () => {
    const entities = Array.from({ length: 210 }, (_, i) => entity(`条目${i}`))
    const capped = rankReferableEntities(entities, '')
    expect(capped).toHaveLength(200)
    expect(capped[0].name).toBe('条目0')
    expect(rankReferableEntities(entities, '', Number.POSITIVE_INFINITY)).toHaveLength(210)
  })

  it('大小写不敏感，别名也参与', () => {
    const entities = [entity('Alice', ['ali']), entity('Bob')]
    expect(rankReferableEntities(entities, 'ALI').map((e) => e.name)).toEqual(['Alice'])
  })

  it('拉丁字母查询按拼音首字母命中，不必先打汉字', () => {
    const entities = [entity('艾拉'), entity('凯尔'), entity('北境')]
    expect(rankReferableEntities(entities, 'al').map((e) => e.name)).toEqual(['艾拉'])
    expect(rankReferableEntities(entities, 'a').map((e) => e.name)).toEqual(['艾拉'])
    expect(rankReferableEntities(entities, 'k').map((e) => e.name)).toEqual(['凯尔'])
    expect(rankReferableEntities(entities, 'bj').map((e) => e.name)).toEqual(['北境'])
  })

  it('拼音首字母只认前缀：l 不命中「艾拉」', () => {
    expect(rankReferableEntities([entity('艾拉')], 'l')).toEqual([])
    expect(rankReferableEntities([entity('艾拉')], 'alice')).toEqual([])
  })

  it('别名同样参与首字母匹配', () => {
    expect(rankReferableEntities([entity('艾拉', ['小艾'])], 'xa').map((e) => e.name)).toEqual([
      '艾拉',
    ])
  })

  it('字面前缀排在拼音首字母之前', () => {
    const entities = [entity('阿花'), entity('Alice')]
    expect(rankReferableEntities(entities, 'a').map((e) => e.name)).toEqual(['Alice', '阿花'])
  })

  it('汉字查询不触发首字母匹配', () => {
    expect(rankReferableEntities([entity('艾拉')], '爱')).toEqual([])
  })

  it('没有命中返回空数组', () => {
    expect(rankReferableEntities([entity('菠菜')], 'xyz')).toEqual([])
  })
})
