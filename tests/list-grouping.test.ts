import { beforeEach, describe, expect, it } from 'vitest'
import {
  UNASSIGNED_COUNTRY_KEY,
  UNASSIGNED_FOLDER_KEY,
  countryGroupKey,
  folderGroupKey,
  groupItems,
  isGroupCollapsed,
  toggleCollapsedKey,
} from '@/lib/list-grouping'
import {
  CHARACTER_GROUP_MODE_STORAGE_KEY,
  readCharacterGroupMode,
  writeCharacterGroupMode,
} from '@/lib/list-grouping-preference'
import {
  groupCharactersByCountry,
  groupCharactersByFolder,
} from '@/features/characters/grouping'
import { placeGroupMenu } from '@/components/shared/GroupModeMenu'
import type { Character, Country } from '@/types'

/* ── 造数据（只填分组用得到的字段，其余给完整的默认值） ─────── */

function character(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: `角色 ${id}`,
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...overrides,
  }
}

function country(id: number, name: string): Country {
  return {
    id,
    name,
    parentId: null,
    description: '',
    system: '',
    geography: '',
    culture: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
  }
}

function idsOf<T extends { id: number }>(items: readonly T[]): number[] {
  return items.map((item) => item.id)
}

function allMemberIds<T extends { id: number }>(groups: readonly { items: T[] }[]): number[] {
  return groups.flatMap((group) => idsOf(group.items))
}

/* ── 纯分组：不漏不重 ─────────────────────────────────── */

describe('groupItems', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => ({ id, bucket: id % 3 }))

  it('分组前后集合恒等：不漏、不重复', () => {
    const groups = groupItems({
      items,
      keyOf: (item) => `bucket:${item.bucket}`,
      known: [0, 1, 2].map((bucket) => ({ key: `bucket:${bucket}`, label: `组 ${bucket}` })),
      fallback: { key: 'unassigned', label: '未归属' },
    })
    const flattened = allMemberIds(groups)
    expect(flattened.sort((a, b) => a - b)).toEqual(idsOf(items))
    expect(new Set(flattened).size).toBe(items.length)
    expect(groups.map((group) => group.label)).toEqual(['组 0', '组 1', '组 2'])
  })

  it('已知分组之外的键：unknownGroup 现建一组，不丢', () => {
    const groups = groupItems({
      items: [{ id: 1, bucket: 'x' }, { id: 2, bucket: 'y' }],
      keyOf: (item) => `bucket:${item.bucket}`,
      unknownGroup: (key) => ({ key, label: key.slice('bucket:'.length) }),
      fallback: { key: 'unassigned', label: '未归属' },
    })
    expect(groups.map((group) => group.label)).toEqual(['x', 'y'])
    expect(allMemberIds(groups).sort()).toEqual([1, 2])
  })

  it('零成员：keepEmpty=false 不渲染，keepEmpty=true 保留已知组（兜底组仍只在有成员时出现）', () => {
    const input = {
      items: [{ id: 1, bucket: 0 }],
      keyOf: (item: { id: number; bucket: number }) => `bucket:${item.bucket}`,
      known: [
        { key: 'bucket:0', label: '组 0' },
        { key: 'bucket:1', label: '组 1' },
      ],
      fallback: { key: 'unassigned', label: '未归属' },
    }
    expect(groupItems(input).map((group) => group.key)).toEqual(['bucket:0'])
    expect(groupItems({ ...input, keepEmpty: true }).map((group) => group.key)).toEqual(['bucket:0', 'bucket:1'])
  })
})

/* ── 角色：按国家（id 优先 / 旧文本回落 / 已删国家） ─────── */

describe('groupCharactersByCountry', () => {
  const countries = [country(1, '晨曦共和国'), country(2, '暮色联邦'), country(3, '空国')]
  const characters = [
    character(10, { countryId: 2, nationalityLegacy: '晨曦共和国' }),
    character(11, { nationalityLegacy: '晨曦共和国' }),
    character(12, { countryId: 99 }),
    character(13),
  ]

  it('id 优先、旧国籍文本回落；已删国家与无归属进「未归属」', () => {
    const groups = groupCharactersByCountry(characters, countries)
    const byKey = new Map(groups.map((group) => [group.key, group]))

    expect(byKey.get(countryGroupKey(1))?.label).toBe('晨曦共和国')
    expect(idsOf(byKey.get(countryGroupKey(1))!.items)).toEqual([11])
    expect(idsOf(byKey.get(countryGroupKey(2))!.items)).toEqual([10])
    expect(byKey.get(UNASSIGNED_COUNTRY_KEY)?.label).toBe('未归属')
    expect(idsOf(byKey.get(UNASSIGNED_COUNTRY_KEY)!.items)).toEqual([12, 13])
  })

  it('分组前后集合恒等；没有成员的国家组不显示', () => {
    const groups = groupCharactersByCountry(characters, countries)
    expect(allMemberIds(groups).sort((a, b) => a - b)).toEqual(idsOf(characters))
    expect(groups.some((group) => group.key === countryGroupKey(3))).toBe(false)
  })

  it('搜索后的子集也按同一口径分组', () => {
    const groups = groupCharactersByCountry([characters[1], characters[3]], countries)
    expect(allMemberIds(groups).sort((a, b) => a - b)).toEqual([11, 13])
  })
})

/* ── 角色：按文件夹（空白 / 清单漏记 / 空夹 / 真名「未分组」） ── */

describe('groupCharactersByFolder', () => {
  const characters = [
    character(20, { folder: '甲' }),
    character(21, { folder: '   ' }),
    character(22, { folder: '未分组' }),
    character(23, { folder: '清单外' }),
  ]

  it('空白进未分组；清单漏记的夹仍显示；空文件夹保留；真名「未分组」与兜底组分开', () => {
    const groups = groupCharactersByFolder({ items: characters, folderNames: ['甲', '空夹'] })
    const byKey = new Map(groups.map((group) => [group.key, group]))

    expect(idsOf(byKey.get(folderGroupKey('甲'))!.items)).toEqual([20])
    expect(byKey.get(folderGroupKey('空夹'))!.items).toEqual([])
    expect(idsOf(byKey.get(folderGroupKey('清单外'))!.items)).toEqual([23])
    // 真实文件夹「未分组」和兜底组同名但不同键、各装各的成员
    expect(byKey.get(folderGroupKey('未分组'))?.label).toBe('未分组')
    expect(idsOf(byKey.get(folderGroupKey('未分组'))!.items)).toEqual([22])
    expect(byKey.get(UNASSIGNED_FOLDER_KEY)?.label).toBe('未分组')
    expect(idsOf(byKey.get(UNASSIGNED_FOLDER_KEY)!.items)).toEqual([21])
    expect(idsOf(byKey.get(UNASSIGNED_FOLDER_KEY)!.items)).not.toContain(22)
  })

  it('搜索时零命中组（含空文件夹）不显示；清空后恢复', () => {
    const searching = groupCharactersByFolder({
      items: [characters[0]],
      folderNames: ['甲', '空夹', '乙'],
      searching: true,
    })
    expect(searching.map((group) => group.key)).toEqual([folderGroupKey('甲')])

    const restored = groupCharactersByFolder({ items: [characters[0]], folderNames: ['甲', '空夹'] })
    expect(restored.map((group) => group.key)).toContain(folderGroupKey('空夹'))
    expect(restored.map((group) => group.key)).not.toContain(UNASSIGNED_FOLDER_KEY)
  })
})

/* ── 折叠键与折叠状态 ─────────────────────────────────── */

describe('折叠键', () => {
  it('命名空间互不冲突，真实文件夹「未分组」不等于兜底组', () => {
    expect(countryGroupKey(12)).toBe('country:12')
    expect(folderGroupKey('12')).toBe('folder:12')
    expect(folderGroupKey('未分组')).not.toBe(UNASSIGNED_FOLDER_KEY)
    expect(countryGroupKey(1)).not.toBe(UNASSIGNED_COUNTRY_KEY)
  })

  it('搜索时展开命中组，清空搜索后恢复折叠；切换返回新集合', () => {
    const collapsed = new Set<string>([countryGroupKey(1)])
    expect(isGroupCollapsed(collapsed, countryGroupKey(1), true)).toBe(false)
    expect(isGroupCollapsed(collapsed, countryGroupKey(1), false)).toBe(true)

    const next = toggleCollapsedKey(collapsed, countryGroupKey(1))
    expect(next.has(countryGroupKey(1))).toBe(false)
    expect(collapsed.has(countryGroupKey(1))).toBe(true)

    const added = toggleCollapsedKey(next, folderGroupKey('甲'))
    expect(added.has(folderGroupKey('甲'))).toBe(true)
  })
})

/* ── 偏好：默认 / 坏值回落 / 按 categoryId 隔离 ─────────── */

describe('分组方式偏好', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('角色默认按国家；写入后可读回；坏值安全回落', () => {
    expect(readCharacterGroupMode()).toBe('country')
    writeCharacterGroupMode('folder')
    expect(readCharacterGroupMode()).toBe('folder')
    localStorage.setItem(CHARACTER_GROUP_MODE_STORAGE_KEY, '按国家')
    expect(readCharacterGroupMode()).toBe('country')
  })
})

/* ── 菜单落点：视口内、下方放不下翻到上方 ───────────────── */

describe('placeGroupMenu', () => {
  it('默认在触发按钮下方并留出间隙', () => {
    const placement = placeGroupMenu({ left: 40, top: 100, bottom: 124 }, { width: 1280, height: 720 }, 2)
    expect(placement.left).toBe(40)
    expect(placement.top).toBe(128)
  })

  it('底部放不下时翻到上方，窄视口里左右夹住', () => {
    const flipped = placeGroupMenu({ left: 40, top: 680, bottom: 704 }, { width: 1280, height: 720 }, 2)
    expect(flipped.top).toBeLessThan(680)

    const narrow = placeGroupMenu({ left: 300, top: 100, bottom: 124 }, { width: 320, height: 720 }, 2)
    expect(narrow.left + narrow.width).toBeLessThanOrEqual(320 - 8)
    expect(narrow.left).toBeGreaterThanOrEqual(8)
  })
})
