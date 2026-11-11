/**
 * 树形表格行模型自检：`npx tsx scripts/tree-table-check.ts`（`npm run audit:tree`）
 *
 * 只验纯函数（`features/tree-table/tree-table-rows.ts`）：层级怎么搭、分组怎么挂、
 * 搜索怎么保留祖先路径。组件与落盘不在这里。
 */
import type { Character, Country, Event, WorldEntry } from '../src/types'
import { buildEntryTree } from '../src/lib/world-tree'
import {
  buildCountryTree,
  flattenCharacterRows,
  flattenCountryRows,
  flattenEntryRows,
  flattenEventRows,
  type RowOptions,
} from '../src/features/tree-table/tree-table-rows'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

const TAG_NAMES: Record<number, string> = { 1: '赤月', 2: '星海' }
const tagName = (ids: number[]): string =>
  ids
    .map((id) => TAG_NAMES[id] ?? '')
    .filter(Boolean)
    .join(' ')

function options(query = '', expanded: string[] = [], all = false): RowOptions {
  return { query, expanded: new Set(expanded), tagName, all }
}

let nextId = 1

function entry(over: Partial<WorldEntry> & Pick<WorldEntry, 'title'>): WorldEntry {
  const { title, ...rest } = over
  return {
    id: nextId++,
    title,
    content: '',
    category: '',
    parentId: null,
    order: 0,
    isConcept: false,
    tags: [],
    relations: [],
    references: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: '',
    _lastModified: 0,
    ...rest,
  }
}

function country(over: Partial<Country> & Pick<Country, 'id' | 'name'>): Country {
  const { id, name, ...rest } = over
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
    _syncStatus: '',
    _lastModified: 0,
    ...rest,
  }
}

function character(over: Partial<Character> & Pick<Character, 'id' | 'name'>): Character {
  const { id, name, ...rest } = over
  return {
    id,
    name,
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
    _syncStatus: '',
    _lastModified: 0,
    ...rest,
  }
}

function event(over: Partial<Event> & Pick<Event, 'id' | 'title'>): Event {
  const { id, title, ...rest } = over
  return {
    id,
    title,
    time: '',
    location: '',
    summary: '',
    content: '',
    characters: [],
    countries: [],
    parentEventId: null,
    relations: [],
    tags: [],
    images: [],
    isMajor: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: '',
    _lastModified: 0,
    ...rest,
  }
}

function labels(rows: { label: string; depth: number }[]): string[] {
  return rows.map((row) => row.label)
}

function main(): void {
  // ── 词条：折叠只出根，搜索保留祖先 ────────────────────────────────────
  const rootA = entry({ title: '帝国' })
  const childB = entry({ title: '北境', parentId: rootA.id, tags: [1] })
  const rootC = entry({ title: '海国', tags: [2] })
  const entryTree = buildEntryTree([rootA, childB, rootC])

  check(
    '词条：默认只出根节点',
    labels(flattenEntryRows(entryTree, options())).join('|') === '帝国|海国',
    labels(flattenEntryRows(entryTree, options())).join('|'),
  )
  const entryExpanded = flattenEntryRows(entryTree, options('', [`entry:${rootA.id}`]))
  check('词条：展开父级带出子级', entryExpanded.map((row) => row.label).join('|') === '帝国|北境|海国')
  check('词条：子级缩进 +1', entryExpanded[1]?.depth === 1, String(entryExpanded[1]?.depth))

  const entryByTag = flattenEntryRows(entryTree, options('赤月'))
  check(
    '词条：按标签名命中子级时父级仍在（祖先路径）',
    entryByTag.map((row) => row.label).join('|') === '帝国|北境',
    entryByTag.map((row) => row.label).join('|'),
  )
  check('词条：搜索时强制展开', entryByTag.every((row) => row.expanded))
  check('词条：没有命中就是空表', flattenEntryRows(entryTree, options('不存在')).length === 0)

  // ── 国家：悬空父级 / 成环都当根，节点不丢 ──────────────────────────────
  const countryA = country({ id: 1, name: '甲' })
  const countryB = country({ id: 2, name: '乙', parentId: 1 })
  const countryC = country({ id: 3, name: '丙', parentId: 99 })
  const countryD = country({ id: 4, name: '丁', parentId: 5 })
  const countryE = country({ id: 5, name: '戊', parentId: 4 })
  const countryTree = buildCountryTree([countryA, countryB, countryC, countryD, countryE])

  const rootIds = countryTree.map((node) => node.country.id).sort()
  check('国家：悬空父级 + 互指成环都落成根', rootIds.join('|') === '1|3|4|5', rootIds.join('|'))
  check('国家：子国家挂在父级下', countryTree.find((node) => node.country.id === 1)?.children[0]?.country.id === 2)

  const countryCollapsed = flattenCountryRows(countryTree, options())
  check('国家：折叠时子国家不出现', !countryCollapsed.some((row) => row.label === '乙'))
  const countryExpanded = flattenCountryRows(countryTree, options('', ['country:1']))
  check('国家：展开父级带出子国家', countryExpanded.some((row) => row.label === '乙'))
  check(
    '国家：按标签名命中',
    flattenCountryRows(buildCountryTree([country({ id: 9, name: '某国', tags: [2] })]), options('星海')).length === 1,
  )

  // ── 角色：按国家分组，未归属兜底 ───────────────────────────────────────
  const characters = [
    character({ id: 11, name: '阿甲', countryId: 1 }),
    character({ id: 12, name: '阿乙', countryId: 2 }),
    character({ id: 13, name: '无名' }),
    character({ id: 14, name: '野人', countryId: 99 }),
  ]
  const groupedCollapsed = flattenCharacterRows(countryTree, characters, options())
  check(
    '角色：折叠时只出国家组 + 未归属组（空国家组不出现）',
    groupedCollapsed.map((row) => row.label).join('|') === '甲|未归属',
    groupedCollapsed.map((row) => row.label).join('|'),
  )
  check('角色：未归属组包含无国籍与悬空国籍', groupedCollapsed[1]?.childCount === 2)

  const groupedOpen = flattenCharacterRows(countryTree, characters, options('', ['group:1', 'group:2']))
  check(
    '角色：展开后是本国的角色 → 下级国家 → 下级角色',
    groupedOpen.map((row) => row.label).join('|') === '甲|阿甲|乙|阿乙|未归属',
    groupedOpen.map((row) => row.label).join('|'),
  )

  const groupedByMember = flattenCharacterRows(countryTree, characters, options('阿乙'))
  check(
    '角色：按角色名命中时保留国家路径、筛掉同组其他人',
    groupedByMember.map((row) => row.label).join('|') === '甲|乙|阿乙',
    groupedByMember.map((row) => row.label).join('|'),
  )

  const groupedByCountry = flattenCharacterRows(countryTree, characters, options('甲'))
  check(
    '角色：按国家名命中时整组保留',
    groupedByCountry.some((row) => row.label === '阿甲') &&
      groupedByCountry.some((row) => row.label === '阿乙'),
    groupedByCountry.map((row) => row.label).join('|'),
  )

  // ── 旧数据：只有 `国籍:` 文本、没有 countryId ──────────────────────────
  // 卡片按文本回落显示国籍、编辑器左侧分组也这么归；表格曾经只看 countryId，
  // 于是同一批老数据在卡片上写着国家、在表格里躺在「未归属」，按国家筛还筛不到。
  {
    const legacyCharacters = [
      character({ id: 15, name: '旧甲', countryId: null, nationalityLegacy: '甲' }),
      character({ id: 16, name: '旧乙', countryId: null, nationalityLegacy: '不存在的国' }),
    ]
    const rows = flattenCharacterRows(countryTree, legacyCharacters, options('', ['group:1']))
    const labels = rows.map((row) => row.label).join('|')
    check('旧国籍文本：能对上国家名就归到那组', labels === '甲|旧甲|未归属', labels)
    check(
      '旧国籍文本：对不上的仍然进未归属',
      rows.filter((row) => row.label === '未归属')[0]?.childCount === 1,
    )
    check(
      '旧国籍文本：表格「所属国家」列与分组用同一个 id',
      rows.find((row) => row.label === '旧甲')?.countryId === 1,
      String(rows.find((row) => row.label === '旧甲')?.countryId),
    )
  }

  // ── 事件：平表 + HTML 字段剥标签 ──────────────────────────────────────
  const events = [
    event({ id: 21, title: '会战', time: '帝国历 100 年', location: '<p>北方边境</p>' }),
    event({ id: 22, title: '和谈', tags: [1] }),
  ]
  check('事件：平表无层级', flattenEventRows(events, options()).every((row) => !row.hasChildren))
  check('事件：按时间命中', labels(flattenEventRows(events, options('100'))).join('|') === '会战')
  check(
    '事件：地点里的 HTML 先剥标签再匹配',
    labels(flattenEventRows(events, options('北方'))).join('|') === '会战',
  )
  check('事件：按标签名命中', labels(flattenEventRows(events, options('赤月'))).join('|') === '和谈')

  if (passed > 0 && !process.exitCode) {
    console.log(`树形表格行模型自检：${passed} 项通过`)
  }
}

main()
