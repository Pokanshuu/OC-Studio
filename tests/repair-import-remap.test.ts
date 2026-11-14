import { describe, expect, it } from 'vitest'

import { remapRowRefs, toRefId, type IdMaps } from '@/lib/import-remap'
import { BackupPayloadError, parseBackupPayload } from '@/lib/import-normalize'

/**
 * 导入引用重映射的**正式回归**（审查报告 F06 / F09 / F11，探针 R05 / R12 / R09）。
 *
 * 这里盯的是「目标身份」而不是数量：
 * - 正文 `mention` / `wikiLink` 必须按目标类型查表（同号不同表不能串）；
 * - 字符串 / 数字 id 两种写法都认，且映射后保持原写法；
 * - 目标缺失时：成员事实断开、命名关系只解除 targetId（文字保留）、正文解除跳转（label 保留）；
 * - 老数据的 JSON 字符串正文也要能改；
 * - 载荷规范化在写库之前就能给出可读错误 / 忽略清单。
 */

function mention(id: string | number, entityType: string, label = '引用'): Record<string, unknown> {
  return { type: 'mention', attrs: { id, entityType, label } }
}

function wikiLink(id: string | number, label = '链接'): Record<string, unknown> {
  return { type: 'wikiLink', attrs: { id, label } }
}

function docWith(...nodes: unknown[]): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] }
}

function mapsOf(
  input: Partial<Record<keyof IdMaps, ReadonlyArray<readonly [number, number]>>> = {},
): IdMaps {
  return {
    characters: new Map(input.characters ?? []),
    countries: new Map(input.countries ?? []),
    events: new Map(input.events ?? []),
    worldEntries: new Map(input.worldEntries ?? []),
    tags: new Map(input.tags ?? []),
  }
}

function bodyNodes(document: unknown): Array<Record<string, unknown>> {
  const doc = document as { content: Array<{ content: Array<{ attrs: Record<string, unknown> }> }> }
  return doc.content[0].content as unknown as Array<Record<string, unknown>>
}

function attrsOf(node: unknown): Record<string, unknown> {
  return (node as { attrs: Record<string, unknown> }).attrs
}

describe('toRefId：字符串与数字 id 都认', () => {
  it('数字 / 数字字符串 → number；其余 → null', () => {
    expect(toRefId(7)).toBe(7)
    expect(toRefId('7')).toBe(7)
    expect(toRefId(' 7 ')).toBe(7)
    expect(toRefId('')).toBeNull()
    expect(toRefId('abc')).toBeNull()
    expect(toRefId(1.5)).toBeNull()
    expect(toRefId(null)).toBeNull()
    expect(toRefId(undefined)).toBeNull()
  })
})

describe('正文引用：按目标类型映射（R05）', () => {
  it('mention / wikiLink 各自查自己的表；字符串 id 映射后仍是字符串', () => {
    const maps = mapsOf({
      characters: [[1, 101]],
      events: [[1, 201]],
      countries: [[1, 301]],
      worldEntries: [[1, 401]],
    })
    const row = {
      document: docWith(
        mention('1', 'character', '角色甲'),
        mention('1', 'event', '事件乙'),
        mention('1', 'country', '国家丙'),
        wikiLink('1', '笔记丁'),
      ),
    }
    const result = remapRowRefs('worldEntry', row, maps)
    const nodes = bodyNodes(result.patch?.document)

    expect(nodes.map((node) => attrsOf(node).id)).toEqual(['101', '201', '301', '401'])
    // label 不动：映射只改身份，不改用户看到的字
    expect(nodes.map((node) => attrsOf(node).label)).toEqual(['角色甲', '事件乙', '国家丙', '笔记丁'])
    expect(result.unlinked).toBe(0)
    expect(result.dropped).toBe(0)
  })

  it('数字 id 映射后仍是数字', () => {
    const maps = mapsOf({ characters: [[1, 11]] })
    const result = remapRowRefs('worldEntry', { document: docWith(mention(1, 'character')) }, maps)
    expect(attrsOf(bodyNodes(result.patch?.document)[0]).id).toBe(11)
    // 数字 1 与字符串 '1' 是同一个备份编号，但写法要保持
    expect(typeof attrsOf(bodyNodes(result.patch?.document)[0]).id).toBe('number')
  })

  it('不能跨实体类型串号：只给了角色映射时，事件提及不许跟着变', () => {
    const maps = mapsOf({ characters: [[1, 101]] })
    const eventResult = remapRowRefs(
      'worldEntry',
      { document: docWith(mention('1', 'event', '事件乙')) },
      maps,
    )
    // 事件表没有 1 的映射 → 目标视为不存在：保留文字、解除跳转，而不是用角色的 101
    const node = bodyNodes(eventResult.patch?.document)[0]
    expect(attrsOf(node).id).toBeUndefined()
    expect(attrsOf(node).label).toBe('事件乙')
    expect(eventResult.unlinked).toBe(1)
  })

  it('wikiLink 永远查词条表，哪怕 mention 表的同号 id 有映射', () => {
    const maps = mapsOf({ characters: [[3, 999]] })
    const result = remapRowRefs('worldEntry', { document: docWith(wikiLink('3', '某笔记')) }, maps)
    const node = bodyNodes(result.patch?.document)[0]
    expect(attrsOf(node).id).toBeUndefined()
    expect(attrsOf(node).label).toBe('某笔记')
  })

  it('嵌套结构（列表 / 引用 / 表格）里的引用同样被改写', () => {
    const maps = mapsOf({ worldEntries: [[2, 202]] })
    const document = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'blockquote', content: [{ type: 'heading', attrs: { level: 2 }, content: [wikiLink('2', '标题里的链接')] }] },
              ],
            },
          ],
        },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [wikiLink(2, '表格里的链接')] }] }] },
          ],
        },
      ],
    }
    const result = remapRowRefs('worldEntry', { document }, maps)
    expect(JSON.stringify(result.patch?.document)).not.toContain('"id":"2"')
    expect(JSON.stringify(result.patch?.document)).toContain('"id":"202"')
    expect(JSON.stringify(result.patch?.document)).toContain('"id":202')
  })

  it('目标不存在：清掉 id、同时丢掉旧 raw（否则重扫会按旧名字误绑同名条目）', () => {
    const maps = mapsOf()
    const row = {
      document: docWith({
        type: 'mention',
        attrs: { id: '9', entityType: 'character', label: '已删除的人', raw: '已删除的人' },
      }),
    }
    const result = remapRowRefs('worldEntry', row, maps)
    const attrs = attrsOf(bodyNodes(result.patch?.document)[0])
    expect(attrs.id).toBeUndefined()
    expect(attrs.label).toBe('已删除的人')
    // Q02：raw 记的是源库的链接原文，目标解除后写回会重新解析到同名的另一条
    expect(attrs.raw).toBeUndefined()
    expect(result.unlinked).toBe(1)
  })

  it('映射命中时也按落库身份重建：旧 raw 丢掉，锚点单独保留（Q02）', () => {
    const maps = mapsOf({ characters: [[1, 101]] })
    const row = {
      document: docWith({
        type: 'mention',
        attrs: { id: '1', entityType: 'character', label: '昵称', raw: '同名角色#小节|昵称' },
      }),
    }
    const attrs = attrsOf(bodyNodes(remapRowRefs('worldEntry', row, maps).patch?.document)[0])
    expect(attrs.id).toBe('101')
    expect(attrs.label).toBe('昵称')
    expect(attrs.raw).toBeUndefined()
    expect(attrs.anchor).toBe('小节')
  })

  it('目标类型未知（entityType 为空）时不动它 —— 猜类型才是串号的来源', () => {
    const maps = mapsOf({ characters: [[1, 101]] })
    const row = { document: docWith({ type: 'mention', attrs: { id: '1', label: '不知道是什么' } }) }
    const result = remapRowRefs('worldEntry', row, maps)
    expect(result.patch).toBeNull()
    expect(result.unlinked).toBe(0)
  })

  it('本身没 id 的节点（[[#本文锚点]]）不动', () => {
    const result = remapRowRefs('worldEntry', { document: docWith(wikiLink('', '#小节')) }, mapsOf())
    expect(result.patch).toBeNull()
  })
})

describe('旧 JSON 字符串正文', () => {
  it('content 是 JSON 字符串时按文档重映射，写回仍是字符串', () => {
    const maps = mapsOf({ worldEntries: [[1, 11]] })
    const raw = JSON.stringify(docWith(wikiLink('1', '旧链接')))
    const result = remapRowRefs('worldEntry', { content: raw }, maps)

    expect(typeof result.patch?.content).toBe('string')
    const parsed = JSON.parse(String(result.patch?.content)) as unknown
    expect(attrsOf(bodyNodes(parsed)[0]).id).toBe('11')
  })

  it('content 是纯文本时不动（不能把它当 JSON 改坏）', () => {
    const result = remapRowRefs('worldEntry', { content: '第一章的手稿，不是 JSON' }, mapsOf())
    expect(result.patch).toBeNull()
  })

  it('document 是 JSON 字符串（老数据形态）时同样处理', () => {
    const maps = mapsOf({ characters: [[1, 11]] })
    const raw = JSON.stringify(docWith(mention('1', 'character')))
    const result = remapRowRefs('character', { document: raw }, maps)
    const parsed = JSON.parse(String(result.patch?.document)) as unknown
    expect(attrsOf(bodyNodes(parsed)[0]).id).toBe('11')
  })
})

describe('层级引用：country.parentId / event.parentEventId / worldEntry.parentId', () => {
  it('国家父级按国家表映射', () => {
    const result = remapRowRefs('country', { parentId: 1 }, mapsOf({ countries: [[1, 2], [2, 3]] }))
    expect(result.patch).toEqual({ parentId: 2 })
  })

  it('数字字符串父级也认', () => {
    const result = remapRowRefs('event', { parentEventId: '1' }, mapsOf({ events: [[1, 7]] }))
    expect(result.patch).toEqual({ parentEventId: 7 })
  })

  it('词条父级按词条表映射', () => {
    const result = remapRowRefs('worldEntry', { parentId: 5 }, mapsOf({ worldEntries: [[5, 50]] }))
    expect(result.patch).toEqual({ parentId: 50 })
  })

  it('父级目标不在这次导入里 → null（当根，不挂到同号的另一条下面）', () => {
    const result = remapRowRefs('worldEntry', { parentId: 5 }, mapsOf({ worldEntries: [[6, 60]] }))
    expect(result.patch).toEqual({ parentId: null })
    expect(result.dropped).toBe(1)
  })

  it('父级本来为空时没有补丁', () => {
    expect(remapRowRefs('country', { parentId: null }, mapsOf()).patch).toBeNull()
  })
})

describe('成员事实：目标不存在就断开', () => {
  it('国籍映射到新国家；查不到就清空并计数', () => {
    expect(remapRowRefs('character', { countryId: 1 }, mapsOf({ countries: [[1, 9]] })).patch).toEqual({ countryId: 9 })

    const missing = remapRowRefs('character', { countryId: 1 }, mapsOf())
    expect(missing.patch).toEqual({ countryId: null })
    expect(missing.dropped).toBe(1)
  })

  it('标签只留能解析的（数字字符串也认）', () => {
    const result = remapRowRefs('character', { tags: ['1', 2, '坏值'] }, mapsOf({ tags: [[1, 11], [2, 22]] }))
    expect(result.patch).toEqual({ tags: [11, 22] })
    expect(result.dropped).toBe(1)
  })

  it('事件参与者 / 相关国家按各自表映射', () => {
    const result = remapRowRefs(
      'event',
      { characters: [1, 2], countries: [1] },
      mapsOf({ characters: [[1, 11]], countries: [[1, 99]] }),
    )
    expect(result.patch).toEqual({ characters: [11], countries: [99] })
    expect(result.dropped).toBe(1)
  })

  it('相关角色（成员关系）目标不存在 → 整条摘掉', () => {
    const result = remapRowRefs(
      'character',
      {
        relatedCharacters: [
          { characterId: 1, name: '甲', relation: '师徒' },
          { characterId: 9, name: '已删的人', relation: '旧识' },
        ],
      },
      mapsOf({ characters: [[1, 11]] }),
    )
    expect(result.patch?.relatedCharacters).toEqual([{ characterId: 11, name: '甲', relation: '师徒' }])
    expect(result.dropped).toBe(1)
  })

  it('references 按 targetType 查表；未知类型不猜', () => {
    const result = remapRowRefs(
      'worldEntry',
      {
        references: [
          { targetType: 'character', targetId: 1 },
          { targetType: 'world', targetId: 2 },
          { targetType: 'nonsense', targetId: 3 },
        ],
      },
      mapsOf({ characters: [[1, 11]], worldEntries: [[2, 22]] }),
    )
    expect(result.patch?.references).toEqual([
      { targetType: 'character', targetId: 11 },
      { targetType: 'world', targetId: 22 },
    ])
    expect(result.dropped).toBe(1)
  })

  it('factionId 是类型未知的软引用：清掉指针，阵营文字保留', () => {
    const result = remapRowRefs('character', { faction: '北境诸族', factionId: 3 }, mapsOf())
    expect(result.patch).toEqual({ factionId: undefined })
    expect(result.dropped).toBe(1)
  })
})

describe('命名语义：目标不存在也保留原文（R12 / F09）', () => {
  it('笔记 relations 保留 name / relation / color / arrow，只解除 targetId', () => {
    const result = remapRowRefs(
      'worldEntry',
      {
        relations: [
          { targetId: 1, name: '仍存在的目标', relation: '相关' },
          { targetId: 9, name: '已删除的故乡', relation: '出生地', color: 'vermilion', arrow: 'forward' },
        ],
      },
      mapsOf({ worldEntries: [[1, 11]] }),
    )
    expect(result.patch?.relations).toEqual([
      { targetId: 11, name: '仍存在的目标', relation: '相关' },
      { name: '已删除的故乡', relation: '出生地', color: 'vermilion', arrow: 'forward' },
    ])
    expect(result.unresolvedNamed).toBe(1)
    expect(result.dropped).toBe(0)
  })

  it('角色 relatedNotes 同样保留文字', () => {
    const result = remapRowRefs(
      'character',
      { relatedNotes: [{ targetId: 7, name: '消失的笔记', relation: '主角' }] },
      mapsOf(),
    )
    expect(result.patch?.relatedNotes).toEqual([{ name: '消失的笔记', relation: '主角' }])
    expect(result.unresolvedNamed).toBe(1)
  })

  it('事件 relations 文字保留（事件命名边没有 name 字段，relation 就是原文）', () => {
    const result = remapRowRefs(
      'event',
      { relations: [{ targetId: 9, relation: '前因', color: 'amber' }] },
      mapsOf(),
    )
    expect(result.patch?.relations).toEqual([{ relation: '前因', color: 'amber' }])
    expect(result.unresolvedNamed).toBe(1)
  })

  it('本来就没有 targetId 的关系原样保留，不算「解除」', () => {
    const row = { relations: [{ name: '已删除的故乡', relation: '出生地' }] }
    const result = remapRowRefs('worldEntry', row, mapsOf())
    expect(result.patch).toBeNull()
    expect(result.unresolvedNamed).toBe(0)
    expect(result.dropped).toBe(0)
  })

  it('没有任何可读文字的空关系才摘掉（不留一行「未命名」）', () => {
    const result = remapRowRefs('event', { relations: [{ targetId: 9, relation: '' }] }, mapsOf())
    expect(result.patch).toEqual({ relations: [] })
    expect(result.dropped).toBe(1)
  })
})

describe('没有引用变化时不产生补丁', () => {
  it('空引用行 → null', () => {
    const result = remapRowRefs(
      'character',
      { countryId: null, tags: [], relatedCharacters: [], relatedNotes: [] },
      mapsOf(),
    )
    expect(result.patch).toBeNull()
  })

  it('引用本来就在本库 id 上（映射是恒等）→ null', () => {
    const result = remapRowRefs('country', { parentId: 3, tags: [4] }, mapsOf({ countries: [[3, 3]], tags: [[4, 4]] }))
    expect(result.patch).toBeNull()
  })

  it('未知扩展字段永远不会被删', () => {
    const result = remapRowRefs('character', { countryId: 1, mood: '开心', custom: { 发色: '黑' } }, mapsOf())
    expect(result.patch).toEqual({ countryId: null })
    expect(result.patch).not.toHaveProperty('mood')
    expect(result.patch).not.toHaveProperty('custom')
  })
})

describe('载荷规范化（F11 / R09）', () => {
  function payloadOf(data: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      exportedAt: '2026-11-14T00:00:00.000Z',
      data: {
        characters: [],
        events: [],
        countries: [],
        worldEntries: [],
        tags: [],
        periods: [],
        ...data,
      },
      ...extra,
    }
  }

  it('不是对象 / 版本不认识 / 缺 data / 前置表不是数组 → 可读错误', () => {
    expect(() => parseBackupPayload(null)).toThrow(BackupPayloadError)
    expect(() => parseBackupPayload('x')).toThrow(/数据不是 JSON 对象/)
    expect(() => parseBackupPayload(payloadOf({}, { version: 3 }))).toThrow(/不支持的版本：3/)
    expect(() => parseBackupPayload({ version: 1 })).toThrow(/缺少 data 字段/)
    expect(() => parseBackupPayload({ version: 1, data: { characters: 'nope' } })).toThrow(/缺少 data.characters 数组/)
  })

  it('null / 基本类型 / 数组元素被忽略并记进 issues，预览与执行同一份结果', () => {
    const raw = payloadOf({
      characters: [null, 'x', 1, [], { id: 1, name: '好角色' }],
      events: [{ id: 2, title: '事件' }],
      countries: [],
      worldEntries: [],
      tags: [],
    })
    const parsed = parseBackupPayload(raw)
    expect(parsed.data.characters).toHaveLength(1)
    expect(parsed.data.characters[0].name).toBe('好角色')
    expect(parsed.issues.length).toBe(4)
    expect(parsed.issues[0]).toMatchObject({ path: 'data.characters[0]' })

    // 再解析一次结果一致（预检与执行各自调用也拿到同一份数据）
    const again = parseBackupPayload(raw)
    expect(again.data.characters).toEqual(parsed.data.characters)
    expect(again.issues).toEqual(parsed.issues)
    // 已经规范化过的载荷直接复用，不再变
    expect(parseBackupPayload(parsed)).toBe(parsed)
  })

  it('重复 id：第一条占映射，后面的按新条目导入（并报告）', () => {
    const parsed = parseBackupPayload(
      payloadOf({ characters: [{ id: 1, name: '甲' }, { id: 1, name: '乙' }] }),
    )
    expect(parsed.data.characters).toHaveLength(2)
    expect(parsed.data.characters[0].id).toBe(1)
    expect(parsed.data.characters[1].id).toBe(-1)
    expect(parsed.issues.some((issue) => issue.message.includes('重复'))).toBe(true)
  })

  it('缺 id 的行给合成负数 id（不会把备份编号写进目标库）', () => {
    const parsed = parseBackupPayload(payloadOf({ tags: [{ name: '标签' }] }))
    expect(parsed.data.tags[0].id).toBe(-1)
    expect(parsed.issues.some((issue) => issue.message.includes('缺少 id'))).toBe(true)
  })

  it('字段类型规范化：数组 / id / 布尔 / 时间戳', () => {
    const parsed = parseBackupPayload(
      payloadOf({
        characters: [
          {
            id: '7',
            name: 42,
            tags: 'not-an-array',
            countryId: 'abc',
            deleted: 'false',
            createdAt: '123',
            relatedCharacters: [null, { characterId: '1', name: '甲' }],
            document: 5,
            mood: '开心',
          },
        ],
        events: [{ id: 8, title: '事件', content: { type: 'doc', content: [] } }],
      }),
    )
    const row = parsed.data.characters[0]
    expect(row.id).toBe(7)
    expect(row.name).toBe('42')
    expect(row.tags).toEqual([])
    expect(row.countryId).toBeNull()
    expect(row.deleted).toBe(false)
    expect(row.createdAt).toBe(123)
    expect(row.relatedCharacters).toEqual([{ characterId: '1', name: '甲' }])
    expect(row).not.toHaveProperty('document')
    // 未知扩展字段保留
    expect(row.mood).toBe('开心')
    // content 声明类型是字符串：对象按 JSON 文本落库（否则读正文的入口会崩）
    expect(typeof parsed.data.events[0].content).toBe('string')
    expect(JSON.parse(String(parsed.data.events[0].content))).toEqual({ type: 'doc', content: [] })
  })

  it('meta 规范化为单例 id 1，超过一条只取第一条并报告', () => {
    const parsed = parseBackupPayload(
      payloadOf({ meta: [{ id: 5, worldName: '甲世界' }, { id: 9, worldName: '乙世界' }] }),
    )
    expect(parsed.data.meta).toEqual([{ id: 1, worldName: '甲世界' }])
    expect(parsed.issues.some((issue) => issue.path === 'data.meta')).toBe(true)
  })

  it('periods / meta 缺失仍按空处理（v1 早期备份的兼容边界）', () => {
    const parsed = parseBackupPayload({
      version: 1,
      data: { characters: [], events: [], countries: [], worldEntries: [], tags: [] },
    })
    expect(parsed.data.periods).toEqual([])
    expect(parsed.data.meta).toEqual([])
    expect(parsed.version).toBe(1)
  })

  it('v2 备份的 data.maps 只统计、不变形', () => {
    const parsed = parseBackupPayload({
      version: 2,
      data: { characters: [], events: [], countries: [], worldEntries: [], tags: [], maps: [{ id: 1, name: '地图' }] },
    })
    expect(parsed.version).toBe(2)
    expect(parsed.maps).toEqual([{ id: 1, name: '地图' }])
  })
})
