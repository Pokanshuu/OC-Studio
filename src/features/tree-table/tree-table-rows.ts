/**
 * 树形表格的行模型（纯函数 + 唯一实现）。
 *
 * 四类数据、三种形态：
 * - **词条** → `lib/world-tree.ts#buildEntryTree`（层级只由 `parentId` 表达，这里不另排一套）
 * - **国家** → `buildCountryTree`（同一条规则：`parentId`；悬空 / 自指 / 成环的父级当根，不消失）
 * - **角色** → **按国家分组**（不是给角色造层级）：国家树当骨架，每个国家下挂自己的角色，
 *   最后补一组「未归属」。祖先国家的 `parentId` 链天然把地区并进它的上级。
 * - **事件** → 平表（事件没有层级）
 *
 * 搜索口径：**命中自身 + 保留祖先路径**。父级不命中、但子孙命中时，父级仍然出现，
 * 否则结果会藏在一个折叠节点里，等于没搜到；搜索期间整棵树强制展开。
 *
 * 这一层不碰 React / Dexie：行怎么排、按什么命中，全在这里决定，组件只负责画。
 */
import type { Character, Country, Event as EntityEvent, WorldEntry } from '@/types'
import { resolveCharacterCountryId } from '@/lib/membership'
import type { WorldTreeNode } from '@/lib/world-tree'
import { plainTextOf } from '@/lib/export/site/render'

export type RowKind = 'entry' | 'country' | 'character' | 'group' | 'event'

export interface TreeRow {
  /** 展开状态与 React key 共用：`entry:12` / `group:unassigned` */
  key: string
  kind: RowKind
  /** 实体 id；`group:unassigned` 用 -1（它不是实体） */
  entityId: number
  label: string
  depth: number
  hasChildren: boolean
  expanded: boolean
  childCount?: number
  /** 删掉之后子项要提到哪一级（词条 / 国家） */
  parentId?: number | null
  /** group 行对应的国家；`null` = 未归属 */
  countryId?: number | null
  entry?: WorldEntry
  country?: Country
  character?: Character
  event?: EntityEvent
}

export interface RowOptions {
  /** 已展开的 `TreeRow.key` */
  expanded: Set<string>
  /** 小写后的关键词；空串 = 不筛选 */
  query: string
  /** 标签 id → 名字：搜索要能按标签名命中 */
  tagName: (ids: number[]) => string
  /** 展开全部（统计可展开行 / 页头的「展开全部」用），忽略 `expanded` */
  all?: boolean
}

/**
 * 单元格只放**纯文本**。
 *
 * 老库的 `制度` / `职业` 这些字段里存的是 HTML 富文本（fork 时期直接存了编辑器序列化的
 * 结果），原样渲染会把 `<p>` 当字显示出来。剥标签不另写一套：导出站的 `plainTextOf`
 * 已经同时认 HTML、Tiptap JSON 字符串与文档对象，能力层也在用它。
 */
export function cellText(value: unknown): string {
  return plainTextOf(value).replace(/\s+/g, ' ').trim()
}

function matches(query: string, ...values: string[]): boolean {
  if (!query) return true
  return values.some((value) => value.toLowerCase().includes(query))
}

/* ── 词条 ───────────────────────────────────────────────── */

export function flattenEntryRows(
  nodes: WorldTreeNode[],
  options: RowOptions,
  depth = 0,
): TreeRow[] {
  const rows: TreeRow[] = []
  for (const node of nodes) {
    const key = `entry:${node.entry.id}`
    const childRows = flattenEntryRows(node.children, options, depth + 1)
    const hit = matches(
      options.query,
      node.entry.title,
      cellText(node.entry.category),
      options.tagName(node.entry.tags ?? []),
    )
    if (options.query && !hit && childRows.length === 0) continue
    const open = options.all === true || options.query !== '' || options.expanded.has(key)
    rows.push({
      key,
      kind: 'entry',
      entityId: node.entry.id,
      label: node.entry.title,
      depth,
      hasChildren: childRows.length > 0,
      expanded: open,
      childCount: node.children.length,
      parentId: node.entry.parentId,
      entry: node.entry,
    })
    if (open) rows.push(...childRows)
  }
  return rows
}

/* ── 国家 ───────────────────────────────────────────────── */

export interface CountryNode {
  country: Country
  children: CountryNode[]
}

/** 平表国家 → 树。悬空 / 自指 / 成环的父级一律当根，节点不会丢 */
export function buildCountryTree(countries: Country[]): CountryNode[] {
  const map = new Map<number, CountryNode>()
  for (const country of countries) map.set(country.id, { country, children: [] })

  /** 父级必须存在、不是自己，且沿 `parentId` 往上走不能在回到自己之前绕圈 */
  const safeParentId = (country: Country): number | null => {
    const parentId = country.parentId
    if (parentId == null || parentId === country.id || !map.has(parentId)) return null
    const seen = new Set<number>([country.id])
    let cursor: number | null = parentId
    while (cursor !== null) {
      if (seen.has(cursor)) return null
      seen.add(cursor)
      cursor = map.get(cursor)?.country.parentId ?? null
    }
    return parentId
  }

  const roots: CountryNode[] = []
  for (const country of countries) {
    const node = map.get(country.id)
    if (!node) continue
    const parentId = safeParentId(country)
    const parent = parentId === null ? undefined : map.get(parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sort = (nodes: CountryNode[]): void => {
    nodes.sort(
      (a, b) =>
        (a.country.order ?? 0) - (b.country.order ?? 0) ||
        a.country.name.localeCompare(b.country.name, 'zh-Hans'),
    )
    for (const node of nodes) sort(node.children)
  }
  sort(roots)
  return roots
}

export function flattenCountryRows(
  nodes: CountryNode[],
  options: RowOptions,
  depth = 0,
): TreeRow[] {
  const rows: TreeRow[] = []
  for (const node of nodes) {
    const key = `country:${node.country.id}`
    const childRows = flattenCountryRows(node.children, options, depth + 1)
    const hit = matches(
      options.query,
      node.country.name,
      cellText(node.country.system),
      options.tagName(node.country.tags ?? []),
    )
    if (options.query && !hit && childRows.length === 0) continue
    const open = options.all === true || options.query !== '' || options.expanded.has(key)
    rows.push({
      key,
      kind: 'country',
      entityId: node.country.id,
      label: node.country.name,
      depth,
      hasChildren: childRows.length > 0,
      expanded: open,
      childCount: node.children.length,
      parentId: node.country.parentId,
      country: node.country,
    })
    if (open) rows.push(...childRows)
  }
  return rows
}

/* ── 角色（按国家分组） ─────────────────────────────────── */

function characterRow(character: Character, depth: number, resolvedCountryId: number | null): TreeRow {
  return {
    key: `character:${character.id}`,
    kind: 'character',
    entityId: character.id,
    label: character.name,
    depth,
    hasChildren: false,
    expanded: false,
    countryId: resolvedCountryId,
    character,
  }
}

function matchesCountry(country: Country, options: RowOptions): boolean {
  return matches(
    options.query,
    country.name,
    cellText(country.system),
    options.tagName(country.tags ?? []),
  )
}

function matchesCharacter(character: Character, options: RowOptions): boolean {
  return matches(
    options.query,
    character.name,
    cellText(character.race),
    cellText(character.occupation),
    options.tagName(character.tags ?? []),
  )
}

export function flattenCharacterRows(
  countryTree: CountryNode[],
  characters: Character[],
  options: RowOptions,
): TreeRow[] {
  const known = new Set<number>()
  /** 同时留一份 `{ id, name }`：旧数据只有 `国籍:` 文本，要按名字反查国家 */
  const allCountries: Country[] = []
  const collect = (nodes: CountryNode[]): void => {
    for (const node of nodes) {
      known.add(node.country.id)
      allCountries.push(node.country)
      collect(node.children)
    }
  }
  collect(countryTree)

  const byCountry = new Map<number, Character[]>()
  const unassigned: Character[] = []
  for (const character of characters) {
    // 与角色卡 / 编辑器分组同一口径：id 优先，只剩旧国籍文本时按名字回落
    const countryId = resolveCharacterCountryId(character, allCountries)
    if (countryId != null && known.has(countryId)) {
      const list = byCountry.get(countryId) ?? []
      list.push(character)
      byCountry.set(countryId, list)
    } else {
      unassigned.push(character)
    }
  }
  const byName = (a: Character, b: Character) => a.name.localeCompare(b.name, 'zh-Hans')
  for (const list of byCountry.values()) list.sort(byName)
  unassigned.sort(byName)

  /** 每个国家子树里一共有多少角色（分组行右侧那个数字） */
  const subtreeCount = new Map<number, number>()
  const countNode = (node: CountryNode): number => {
    const total =
      (byCountry.get(node.country.id)?.length ?? 0) +
      node.children.reduce((sum, child) => sum + countNode(child), 0)
    subtreeCount.set(node.country.id, total)
    return total
  }
  for (const node of countryTree) countNode(node)

  /**
   * `retain` = 这一支必须整枝保留：搜索命中的国家之下，成员不再逐个过滤
   * （命中「海青」时应该看到它下面所有人，而不是只留下名字里也带「海青」的那几个）。
   */
  const build = (nodes: CountryNode[], depth: number, retain: boolean): TreeRow[] => {
    const rows: TreeRow[] = []
    for (const node of nodes) {
      const key = `group:${node.country.id}`
      const countryHit = matchesCountry(node.country, options)
      const keepWhole = retain || countryHit
      const childRows = build(node.children, depth + 1, keepWhole)
      const members = byCountry.get(node.country.id) ?? []
      const visibleMembers =
        options.query && !keepWhole ? members.filter((item) => matchesCharacter(item, options)) : members
      // 没有成员、也没有有内容的下级：这个国家组没有信息量（无搜索时同一口径）
      if (visibleMembers.length === 0 && childRows.length === 0) continue
      const open = options.all === true || options.query !== '' || options.expanded.has(key)
      rows.push({
        key,
        kind: 'group',
        entityId: node.country.id,
        label: node.country.name,
        depth,
        hasChildren: visibleMembers.length + childRows.length > 0,
        expanded: open,
        childCount: subtreeCount.get(node.country.id) ?? members.length,
        countryId: node.country.id,
        country: node.country,
      })
      if (!open) continue
      for (const member of visibleMembers) rows.push(characterRow(member, depth + 1, node.country.id))
      rows.push(...childRows)
    }
    return rows
  }

  const rows = build(countryTree, 0, false)

  const visibleUnassigned = options.query
    ? unassigned.filter((item) => matchesCharacter(item, options))
    : unassigned
  if (visibleUnassigned.length > 0) {
    const key = 'group:unassigned'
    const open = options.all === true || options.query !== '' || options.expanded.has(key)
    rows.push({
      key,
      kind: 'group',
      entityId: -1,
      label: '未归属',
      depth: 0,
      hasChildren: unassigned.length > 0,
      expanded: open,
      childCount: unassigned.length,
      countryId: null,
    })
    if (open) for (const character of visibleUnassigned) rows.push(characterRow(character, 1, null))
  }

  return rows
}

/* ── 事件 ───────────────────────────────────────────────── */

export function flattenEventRows(events: EntityEvent[], options: RowOptions): TreeRow[] {
  return events
    .filter((event) =>
      matches(
        options.query,
        event.title,
        event.time ?? '',
        cellText(event.location),
        options.tagName(event.tags ?? []),
      ),
    )
    .map((event) => ({
      key: `event:${event.id}`,
      kind: 'event' as const,
      entityId: event.id,
      label: event.title,
      depth: 0,
      hasChildren: false,
      expanded: false,
      event,
    }))
}
