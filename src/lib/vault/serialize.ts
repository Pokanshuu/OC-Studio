import type { Character, Country, Event, Period, Tag, WorldEntry } from '@/types'
import {
  CHARACTER_KEYS,
  COUNTRY_KEYS,
  EVENT_KEYS,
  PERIOD_KEYS,
  TAG_KEYS,
  WORLD_KEYS,
  chainKeys,
  writeBool,
  writeNumber,
  writePosition,
  writeString,
  writeStringList,
  type KeyChain,
} from './fields'
import type { VaultEntityKind, VaultStorableKind } from './types'
import { customFieldKeys } from './vault-field-keys'

// ── 实体 → frontmatter 更新 ─────────────────────────────────────────────
// 与 scan.ts 共用 fields.ts 的键链，因此读写的键永久对齐。
//
// 三条硬规则：
//
// 1. **未改动就不写**（最重要的那条）。
//    序列化必须带「装载时的原值快照」：某个键算出来的磁盘值如果与快照一致，
//    就完全跳过它。于是「打开 vault → 什么都没改 → 保存」对文件是**零改动**。
//    没有这条，「简称」会被规范成「正名」（因为 id→名字解析回的是正名），
//    用户一保存就发现 41 个文件被改了 —— 实测踩过。
//
// 2. **跟着文件已有的键名走**。键链里任一键已存在于原文件，就继续用那个键，
//    只在都没有时才用主键。于是 `阵营` / `所属国家` 这类中文键被保留下来，
//    新建的 vault 则用 `faction` / `country`。
//
// 3. **从不整体重写**。只产出「哪些键要变成什么」，由 `frontmatter.setFrontmatterKeys`
//    逐键替换。不在键链里的键（`date`、`定位`、用户自造键）一个字节都不动。

export interface SerializeContext {
  /** 引用解析：把实体 id 换回磁盘上的名字（磁盘上没有 id） */
  nameOf: (kind: VaultEntityKind, id: number) => string | undefined
  /** 标签 id → 标签名 */
  tagName: (id: number) => string | undefined
}

/** frontmatter 更新表；值为 undefined 表示删除该键 */
export type FrontmatterUpdates = Record<string, unknown>

/** 装载时的原值快照；新建实体传 null（等于「全都算改动」） */
export interface EntitySnapshot {
  /** 该实体被装载时的样子（只用到其可写字段） */
  entity: unknown
  /** 该文件当时的 frontmatter（决定沿用哪个键名） */
  frontmatter: Record<string, unknown>
}

/** 两个磁盘表示是否等价（undefined 与空数组都表示「空」） */
function sameDiskValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined && Array.isArray(b) && b.length === 0) return true
  if (b === undefined && Array.isArray(a) && a.length === 0) return true
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  // 对象值（目前只有 `graph_position: { x, y }`）：键顺序由写入侧固定，逐字节比较即可
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/** 写入一个键链：选定键名、清掉其余已存在的同义键 */
function put(
  out: FrontmatterUpdates,
  existing: Record<string, unknown>,
  chain: KeyChain,
  value: unknown,
): void {
  const keys = chainKeys(chain)
  const chosen = keys.find((key) => key in existing) ?? chain.primary
  out[chosen] = value
  for (const key of keys) {
    if (key !== chosen && key in existing) out[key] = undefined
  }
}

/**
 * 只在「现在要写的值」与「装载时的值」不同时才写。
 *
 * prev === null 表示没有快照（新建实体），一律写入。
 * 这里**不能用 undefined 当哨兵**：undefined 本身就是合法的磁盘值
 * （语义是「删除该键」），用它当哨兵会让所有空字段每次都被判成「改动过」。
 */
function putIfChanged(
  out: FrontmatterUpdates,
  existing: Record<string, unknown>,
  chain: KeyChain,
  now: unknown,
  prev: unknown,
): void {
  if (prev !== null && sameDiskValue(now, prev)) return
  put(out, existing, chain, now)
}

/** 引用列表（名字数组） */
/**
 * 自定义字段写回：键 = 字段表里的 key（中文名），只写**改动过**的那几个。
 * 上一份快照里没有这个值、现在也是空 —— 直接跳过，免得每次保存都往文件里塞一串删除。
 */
function putCustomFields(
  out: FrontmatterUpdates,
  existing: Record<string, unknown>,
  kind: 'character' | 'event' | 'worldEntry',
  current: Record<string, string> | undefined,
  previous: Record<string, string> | undefined,
): void {
  for (const key of customFieldKeys(kind)) {
    const now = writeString(current?.[key] ?? '')
    const before = previous === undefined ? undefined : writeString(previous[key] ?? '')
    if (now === undefined && before === undefined) continue
    putIfChanged(out, existing, { primary: key, alt: [] }, now, before ?? null)
  }
}
function namesOf(
  ctx: SerializeContext,
  kind: VaultEntityKind,
  ids: number[] | undefined,
): string[] | undefined {
  if (ids === undefined) return undefined
  const names = ids
    .map((id) => ctx.nameOf(kind, id))
    .filter((name): name is string => typeof name === 'string' && name !== '')
  return names.length === 0 ? [] : names
}

function tagNames(ctx: SerializeContext, ids: number[] | undefined): string[] | undefined {
  if (ids === undefined) return undefined
  const names = ids
    .map((id) => ctx.tagName(id))
    .filter((name): name is string => typeof name === 'string' && name !== '')
  return names.length === 0 ? undefined : names
}

/** 角色所属国家：优先用解析出的国家正名，回落国籍原文 */
function countryDiskValue(
  entity: Character,
  ctx: SerializeContext,
): string | undefined {
  if (entity.countryId === undefined) return writeString(entity.nationalityLegacy)
  return writeString(ctx.nameOf('country', entity.countryId) ?? entity.nationalityLegacy)
}

function imageListDisk(
  items: { url: string; caption?: string; type?: string }[] | undefined,
): Record<string, unknown>[] | undefined {
  if (items === undefined) return undefined
  if (items.length === 0) return undefined
  return items.map((item) => {
    const row: Record<string, unknown> = { url: item.url }
    if (item.caption) row.caption = item.caption
    if (item.type) row.type = item.type
    return row
  })
}

function relationDisk(
  entity: Character,
  ctx: SerializeContext,
): Record<string, unknown>[] | undefined {
  const rows = entity.relatedCharacters
    .map((item) => {
      const resolved =
        (item.characterId !== undefined ? ctx.nameOf('character', item.characterId) : undefined) ??
        item.name
      if (resolved === '') return null
      const row: Record<string, unknown> = { name: resolved }
      if (item.relation) row.relation = item.relation
      return row
    })
    .filter((row): row is Record<string, unknown> => row !== null)
  return rows.length === 0 ? undefined : rows
}

/** 事件之间的关系（与角色关系同形，只是目标换成事件） */
function eventRelationDisk(
  entity: Event,
  ctx: SerializeContext,
): Record<string, unknown>[] | undefined {
  const rows = (entity.relations ?? [])
    .map((item) => {
      const resolved =
        item.targetId !== undefined ? ctx.nameOf('event', item.targetId) : undefined
      if (resolved === undefined || resolved === '') return null
      const row: Record<string, unknown> = { name: resolved }
      if (item.relation) row.relation = item.relation
      return row
    })
    .filter((row): row is Record<string, unknown> => row !== null)
  return rows.length === 0 ? undefined : rows
}

export function serializeCharacter(
  entity: Character,
  prev: Character | null,
  snapshot: EntitySnapshot,
  ctx: SerializeContext,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter

  putIfChanged(out, existing, CHARACTER_KEYS.title, writeString(entity.name), prev === null ? null : writeString(prev.name))
  putIfChanged(out, existing, CHARACTER_KEYS.aliases, writeStringList(entity.aliases), prev === null ? null : writeStringList(prev.aliases))
  putIfChanged(out, existing, CHARACTER_KEYS.race, writeString(entity.race), prev === null ? null : writeString(prev.race))
  putIfChanged(out, existing, CHARACTER_KEYS.element, writeString(entity.element), prev === null ? null : writeString(prev.element))
  putIfChanged(out, existing, CHARACTER_KEYS.occupation, writeString(entity.occupation), prev === null ? null : writeString(prev.occupation))
  putIfChanged(out, existing, CHARACTER_KEYS.faction, writeString(entity.faction), prev === null ? null : writeString(prev.faction))
  putIfChanged(out, existing, CHARACTER_KEYS.country, countryDiskValue(entity, ctx), prev === null ? null : countryDiskValue(prev, ctx))
  putIfChanged(out, existing, CHARACTER_KEYS.height, writeString(entity.height), prev === null ? null : writeString(prev.height))
  putIfChanged(out, existing, CHARACTER_KEYS.birthday, writeString(entity.birthday), prev === null ? null : writeString(prev.birthday))
  putIfChanged(out, existing, CHARACTER_KEYS.bio, writeString(entity.bio), prev === null ? null : writeString(prev.bio))
  putIfChanged(out, existing, CHARACTER_KEYS.lifeStory, writeString(entity.lifeStory), prev === null ? null : writeString(prev.lifeStory))
  putIfChanged(out, existing, CHARACTER_KEYS.isMajor, writeBool(entity.isMajor === true), prev === null ? null : writeBool(prev.isMajor === true))
  putIfChanged(out, existing, CHARACTER_KEYS.avatar, writeString(entity.avatarUrl), prev === null ? null : writeString(prev.avatarUrl))
  putIfChanged(out, existing, CHARACTER_KEYS.header, writeString(entity.headerUrl ?? ''), prev === null ? null : writeString(prev.headerUrl ?? ''))
  putIfChanged(out, existing, CHARACTER_KEYS.tags, tagNames(ctx, entity.tags), prev === null ? null : tagNames(ctx, prev.tags))
  putIfChanged(out, existing, CHARACTER_KEYS.gallery, imageListDisk(entity.gallery), prev === null ? null : imageListDisk(prev.gallery))
  putIfChanged(out, existing, CHARACTER_KEYS.avatars, imageListDisk(entity.avatars), prev === null ? null : imageListDisk(prev.avatars))
  putIfChanged(out, existing, CHARACTER_KEYS.relations, relationDisk(entity, ctx), prev === null ? null : relationDisk(prev, ctx))
  putIfChanged(out, existing, CHARACTER_KEYS.order, writeNumber(entity.order), prev === null ? null : writeNumber(prev.order))
  putIfChanged(out, existing, CHARACTER_KEYS.graphPosition, writePosition(entity.graphPosition), prev === null ? null : writePosition(prev.graphPosition))
  putCustomFields(out, existing, 'character', entity.custom, prev === null ? undefined : prev.custom)

  // 注意：`date` 刻意不写 —— 那是作者的创作日期，不该被 updatedAt 覆盖
  return out
}

export function serializeCountry(
  entity: Country,
  prev: Country | null,
  snapshot: EntitySnapshot,
  ctx: SerializeContext,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter
  const p = prev

  const parentValue = (e: Country): string | undefined =>
    e.parentId === undefined || e.parentId === null
      ? undefined
      : writeString(ctx.nameOf('country', e.parentId) ?? '')

  putIfChanged(out, existing, COUNTRY_KEYS.title, writeString(entity.name), p === null ? null : writeString(p.name))
  putIfChanged(out, existing, COUNTRY_KEYS.aliases, writeStringList(entity.aliases ?? []), p === null ? null : writeStringList(p.aliases ?? []))
  putIfChanged(out, existing, COUNTRY_KEYS.parent, parentValue(entity), p === null ? null : parentValue(p))
  putIfChanged(out, existing, COUNTRY_KEYS.description, writeString(entity.description), p === null ? null : writeString(p.description))
  putIfChanged(out, existing, COUNTRY_KEYS.system, writeString(entity.system), p === null ? null : writeString(p.system))
  putIfChanged(out, existing, COUNTRY_KEYS.geography, writeString(entity.geography), p === null ? null : writeString(p.geography))
  putIfChanged(out, existing, COUNTRY_KEYS.culture, writeString(entity.culture), p === null ? null : writeString(p.culture))
  putIfChanged(out, existing, COUNTRY_KEYS.flag, writeString(entity.flagUrl ?? ''), p === null ? null : writeString(p.flagUrl ?? ''))
  putIfChanged(out, existing, COUNTRY_KEYS.header, writeString(entity.headerUrl ?? ''), p === null ? null : writeString(p.headerUrl ?? ''))
  putIfChanged(out, existing, COUNTRY_KEYS.characters, namesOf(ctx, 'character', entity.characters), p === null ? null : namesOf(ctx, 'character', p.characters))
  putIfChanged(out, existing, COUNTRY_KEYS.events, namesOf(ctx, 'event', entity.events), p === null ? null : namesOf(ctx, 'event', p.events))
  putIfChanged(out, existing, COUNTRY_KEYS.tags, tagNames(ctx, entity.tags), p === null ? null : tagNames(ctx, p.tags))
  putIfChanged(out, existing, COUNTRY_KEYS.order, writeNumber(entity.order), p === null ? null : writeNumber(p.order))
  putIfChanged(out, existing, COUNTRY_KEYS.graphPosition, writePosition(entity.graphPosition), p === null ? null : writePosition(p.graphPosition))
  return out
}

export function serializeEvent(
  entity: Event,
  prev: Event | null,
  snapshot: EntitySnapshot,
  ctx: SerializeContext,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter
  const p = prev

  const parentValue = (e: Event): string | undefined =>
    e.parentEventId === undefined || e.parentEventId === null
      ? undefined
      : writeString(ctx.nameOf('event', e.parentEventId) ?? '')

  putIfChanged(out, existing, EVENT_KEYS.title, writeString(entity.title), p === null ? null : writeString(p.title))
  putIfChanged(out, existing, EVENT_KEYS.aliases, writeStringList(entity.aliases ?? []), p === null ? null : writeStringList(p.aliases ?? []))
  putIfChanged(out, existing, EVENT_KEYS.time, writeString(entity.time), p === null ? null : writeString(p.time))
  putIfChanged(out, existing, EVENT_KEYS.endTime, writeString(entity.endTime ?? ''), p === null ? null : writeString(p.endTime ?? ''))
  putIfChanged(out, existing, EVENT_KEYS.location, writeString(entity.location), p === null ? null : writeString(p.location))
  putIfChanged(out, existing, EVENT_KEYS.summary, writeString(entity.summary), p === null ? null : writeString(p.summary))
  putIfChanged(out, existing, EVENT_KEYS.isMajor, writeBool(entity.isMajor), p === null ? null : writeBool(p.isMajor))
  putIfChanged(out, existing, EVENT_KEYS.parent, parentValue(entity), p === null ? null : parentValue(p))
  putIfChanged(out, existing, EVENT_KEYS.characters, namesOf(ctx, 'character', entity.characters), p === null ? null : namesOf(ctx, 'character', p.characters))
  putIfChanged(out, existing, EVENT_KEYS.countries, namesOf(ctx, 'country', entity.countries), p === null ? null : namesOf(ctx, 'country', p.countries))
  putIfChanged(out, existing, EVENT_KEYS.header, writeString(entity.headerUrl ?? ''), p === null ? null : writeString(p.headerUrl ?? ''))
  putIfChanged(out, existing, EVENT_KEYS.images, imageListDisk(entity.images), p === null ? null : imageListDisk(p.images))
  putIfChanged(out, existing, EVENT_KEYS.relations, eventRelationDisk(entity, ctx), p === null ? null : eventRelationDisk(p, ctx))
  putIfChanged(out, existing, EVENT_KEYS.tags, tagNames(ctx, entity.tags), p === null ? null : tagNames(ctx, p.tags))
  putIfChanged(out, existing, EVENT_KEYS.order, writeNumber(entity.order), p === null ? null : writeNumber(p.order))
  putIfChanged(out, existing, EVENT_KEYS.graphPosition, writePosition(entity.graphPosition), p === null ? null : writePosition(p.graphPosition))
  putCustomFields(out, existing, 'event', entity.custom, p === null ? undefined : p.custom)
  return out
}

export function serializeWorldEntry(
  entity: WorldEntry,
  prev: WorldEntry | null,
  snapshot: EntitySnapshot,
  ctx: SerializeContext,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter
  const p = prev

  const parentValue = (e: WorldEntry): string | undefined =>
    e.parentId === undefined || e.parentId === null
      ? undefined
      : writeString(ctx.nameOf('worldEntry', e.parentId) ?? '')

  putIfChanged(out, existing, WORLD_KEYS.title, writeString(entity.title), p === null ? null : writeString(p.title))
  putIfChanged(out, existing, WORLD_KEYS.aliases, writeStringList(entity.aliases ?? []), p === null ? null : writeStringList(p.aliases ?? []))
  // `分类` 已废弃：层级只由 `parent` 表达，界面不再编辑。
  // 只在**有值**时写 —— 老数据迁移时保住原值，新条目（空）则绝不碰文件里已有的键。
  if (entity.category.trim() !== '') {
    putIfChanged(out, existing, WORLD_KEYS.category, writeString(entity.category), p === null ? null : writeString(p.category))
  }
  putIfChanged(out, existing, WORLD_KEYS.parent, parentValue(entity), p === null ? null : parentValue(p))
  putIfChanged(out, existing, WORLD_KEYS.order, writeNumber(entity.order), p === null ? null : writeNumber(p.order))
  putIfChanged(out, existing, WORLD_KEYS.isConcept, writeBool(entity.isConcept), p === null ? null : writeBool(p.isConcept))
  putIfChanged(out, existing, WORLD_KEYS.tags, tagNames(ctx, entity.tags), p === null ? null : tagNames(ctx, p.tags))
  putCustomFields(out, existing, 'worldEntry', entity.custom, p === null ? undefined : p.custom)
  return out
}

export function serializeTag(
  entity: Tag,
  prev: Tag | null,
  snapshot: EntitySnapshot,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter
  putIfChanged(out, existing, TAG_KEYS.title, writeString(entity.name), prev === null ? null : writeString(prev.name))
  putIfChanged(out, existing, TAG_KEYS.color, writeString(entity.color), prev === null ? null : writeString(prev.color))
  putIfChanged(out, existing, TAG_KEYS.category, writeString(entity.category), prev === null ? null : writeString(prev.category))
  return out
}

export function serializePeriod(
  entity: Period,
  prev: Period | null,
  snapshot: EntitySnapshot,
): FrontmatterUpdates {
  const out: FrontmatterUpdates = {}
  const existing = snapshot.frontmatter
  putIfChanged(out, existing, PERIOD_KEYS.title, writeString(entity.name), prev === null ? null : writeString(prev.name))
  putIfChanged(out, existing, PERIOD_KEYS.startTime, writeString(entity.startTime), prev === null ? null : writeString(prev.startTime))
  putIfChanged(out, existing, PERIOD_KEYS.endTime, writeString(entity.endTime), prev === null ? null : writeString(prev.endTime))
  putIfChanged(out, existing, PERIOD_KEYS.color, writeString(entity.color), prev === null ? null : writeString(prev.color))
  return out
}

/** 统一的序列化入口（写回队列按表名分发到这里） */
export function serializeEntity(
  kind: VaultStorableKind,
  entity: unknown,
  prev: unknown,
  snapshot: EntitySnapshot,
  ctx: SerializeContext,
): FrontmatterUpdates {
  switch (kind) {
    case 'character':
      return serializeCharacter(entity as Character, (prev ?? null) as Character | null, snapshot, ctx)
    case 'country':
      return serializeCountry(entity as Country, (prev ?? null) as Country | null, snapshot, ctx)
    case 'event':
      return serializeEvent(entity as Event, (prev ?? null) as Event | null, snapshot, ctx)
    case 'worldEntry':
      return serializeWorldEntry(entity as WorldEntry, (prev ?? null) as WorldEntry | null, snapshot, ctx)
    case 'tag':
      return serializeTag(entity as Tag, (prev ?? null) as Tag | null, snapshot)
    case 'period':
      return serializePeriod(entity as Period, (prev ?? null) as Period | null, snapshot)
  }
}
