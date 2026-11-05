import { db } from '@/lib/db'
import { entityBodyText } from '@/lib/entity-text'
import { stripHtml } from '@/lib/utils'
import type { Character, Country, Event, WorldEntry } from '@/types'
import { buildSnippet, matchRow, searchTerms, type SearchMatchField } from './matcher'

/**
 * 全局搜索（顶栏 Ctrl+K / 移动端搜索）的内核。
 *
 * 为什么不用 reference-registry：那份注册表服务的是 `@` / `[[` 补全，只认名字与别名，
 * 候选还要按类型硬截断。全局搜索要的是「连正文一起找」，并且要能给出命中摘要，
 * 所以单独一份索引；`@` / `[[` 仍走名字补全，不受这里影响。
 *
 * 索引策略（不做常驻全文索引）：
 * - 打开搜索时整表读一次 Dexie，正文用 `updatedAt` 做缓存键，只有改过的实体才重新提纯文本
 * - 30 秒内复用同一份快照；打开搜索会强制刷新一次（改完笔记立刻搜得到）
 * - 子串匹配对中文天然有效，不需要分词器；上限见 `MAX_BODY_CHARS`
 */

export type GlobalSearchKind = 'character' | 'event' | 'country' | 'world'

export const SEARCH_KIND_ORDER: GlobalSearchKind[] = ['character', 'event', 'country', 'world']

export const SEARCH_KIND_LABEL: Record<GlobalSearchKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

export interface GlobalSearchHit {
  kind: GlobalSearchKind
  id: number
  title: string
  /** 命中位置：标题 / 别名 / 字段 / 正文 */
  matched: SearchMatchField
  /** 正文或字段里的一段上下文（没有就不显示第二行） */
  snippet?: string
  score: number
  updatedAt: number
  avatarUrl?: string
}

export interface GlobalSearchGroup {
  kind: GlobalSearchKind
  label: string
  hits: GlobalSearchHit[]
  /** 该类型的总命中数（可能大于 `hits.length`，界面上用 `+` 表示还有） */
  total: number
}

export interface GlobalSearchOptions {
  /** 每个类型最多列几条（默认 6） */
  perKind?: number
}

interface IndexRow {
  kind: GlobalSearchKind
  id: number
  title: string
  titleLower: string
  aliases: string[]
  aliasesLower: string[]
  fieldLower: string
  bodyLower: string
  body: string
  field: string
  updatedAt: number
  avatarUrl?: string
}

/** 单篇索引正文的字符上限：一本百万字的小说也只会截到这一篇的前 8 万字 */
const MAX_BODY_CHARS = 80_000
const INDEX_TTL = 30_000

interface CachedText {
  updatedAt: number
  body: string
  field: string
}

const textCache = new Map<string, CachedText>()
let index: IndexRow[] | null = null
let builtAt = 0
let pending: Promise<IndexRow[]> | null = null
/** 切库计数：在途的旧库构建结果不许覆盖新库索引 */
let generation = 0

/** 清空索引与正文缓存（切换笔记库时调用，避免旧库同 id 的行串味） */
export function resetSearchIndex(): void {
  generation += 1
  index = null
  pending = null
  builtAt = 0
  textCache.clear()
}

function fieldTextOf(kind: GlobalSearchKind, entity: Character | Event | Country | WorldEntry): string {
  const values: string[] = []
  if (kind === 'character') {
    const character = entity as Character
    values.push(
      character.race,
      character.element,
      character.occupation,
      character.faction,
      character.height,
      character.birthday,
      // bio 在老库里是编辑器 HTML，摘要里不能出现标签
      stripHtml(character.bio),
    )
  } else if (kind === 'event') {
    const event = entity as Event
    values.push(event.time, event.endTime ?? '', event.location, event.summary)
  } else if (kind === 'country') {
    const country = entity as Country
    values.push(country.system, country.geography, country.culture, stripHtml(country.description))
  } else {
    const world = entity as WorldEntry
    values.push(world.summary ?? '', world.chapterOutline ?? '', world.novelAuthor ?? '', world.novelSynopsis ?? '')
  }
  for (const value of Object.values(entity.custom ?? {})) {
    if (typeof value === 'string') values.push(value)
  }
  return values.filter((value) => typeof value === 'string' && value.trim() !== '').join('\n')
}

function cachedText(kind: GlobalSearchKind, entity: Character | Event | Country | WorldEntry): CachedText {
  const key = `${kind}:${entity.id}`
  const cached = textCache.get(key)
  if (cached !== undefined && cached.updatedAt === entity.updatedAt) return cached

  const entry: CachedText = {
    updatedAt: entity.updatedAt ?? 0,
    body: entityBodyText(kind, entity).slice(0, MAX_BODY_CHARS),
    field: fieldTextOf(kind, entity),
  }
  textCache.set(key, entry)
  return entry
}

function makeRow(
  kind: GlobalSearchKind,
  entity: Character | Event | Country | WorldEntry,
  title: string,
  aliases: string[],
  avatarUrl?: string,
): IndexRow {
  const text = cachedText(kind, entity)
  const cleanAliases = aliases.filter((alias) => alias.trim() !== '')
  return {
    kind,
    id: entity.id,
    title,
    titleLower: title.toLocaleLowerCase('zh-Hans'),
    aliases: cleanAliases,
    aliasesLower: cleanAliases.map((alias) => alias.toLocaleLowerCase('zh-Hans')),
    fieldLower: text.field.toLocaleLowerCase('zh-Hans'),
    bodyLower: text.body.toLocaleLowerCase('zh-Hans'),
    body: text.body,
    field: text.field,
    updatedAt: entity.updatedAt ?? 0,
    avatarUrl,
  }
}

async function buildIndex(): Promise<IndexRow[]> {
  const run = generation
  const [characters, events, countries, worldEntries] = await Promise.all([
    db.characters.toArray(),
    db.events.toArray(),
    db.countries.toArray(),
    db.worldEntries.toArray(),
  ])

  const next: IndexRow[] = []
  for (const character of characters) {
    if (character.deleted) continue
    next.push(
      makeRow('character', character, character.name.trim() || '未命名', character.aliases ?? [], character.avatarUrl || undefined),
    )
  }
  for (const event of events) {
    if (event.deleted) continue
    next.push(makeRow('event', event, event.title.trim() || '未命名', event.aliases ?? []))
  }
  for (const country of countries) {
    if (country.deleted) continue
    next.push(makeRow('country', country, country.name.trim() || '未命名', country.aliases ?? [], country.flagUrl || undefined))
  }
  for (const world of worldEntries) {
    if (world.deleted) continue
    next.push(makeRow('world', world, world.title.trim() || '未命名', world.aliases ?? []))
  }

  // 只保留仍然存在的实体，切库 / 删条目后缓存不会越攒越大
  const live = new Set(next.map((row) => `${row.kind}:${row.id}`))
  for (const key of textCache.keys()) {
    if (!live.has(key)) textCache.delete(key)
  }

  // 构建期间切了库：结果可以交给这一次调用，但不许写进全局索引
  if (run !== generation) return next

  index = next
  builtAt = Date.now()
  return next
}

async function loadIndex(force: boolean): Promise<IndexRow[]> {
  if (!force && index !== null && Date.now() - builtAt < INDEX_TTL) return index
  if (pending !== null) return pending
  const tracked = buildIndex().finally(() => {
    if (pending === tracked) pending = null
  })
  pending = tracked
  return tracked
}

/** 打开搜索时强制刷一次（只重新提取改过的正文，其余走缓存） */
export async function refreshSearchIndex(): Promise<void> {
  // 打开时已有构建在途：那一份可能读的是打开前的数据，等它落地后再补一次
  const hadPending = pending !== null
  await loadIndex(true)
  if (hadPending) await loadIndex(true)
}

/**
 * 搜标题 / 别名 / 字段 / 正文，按实体类型分组。
 * 每个类型内：标题命中优先，其次别名 / 字段 / 正文，同分时最近更新的靠前。
 */
export async function searchGlobal(query: string, options: GlobalSearchOptions = {}): Promise<GlobalSearchGroup[]> {
  const terms = searchTerms(query)
  if (terms.length === 0) return []

  const rows = await loadIndex(false)
  const perKind = Math.max(1, Math.min(20, options.perKind ?? 6))
  const groups: GlobalSearchGroup[] = []

  for (const kind of SEARCH_KIND_ORDER) {
    const hits: GlobalSearchHit[] = []
    for (const row of rows) {
      if (row.kind !== kind) continue
      const match = matchRow(row, terms)
      if (match === null) continue
      // 命中在别名上时标题里看不到查询词，补一段别名行，让「为什么匹配」可见
      const aliasSnippet = row.aliases.length > 0 ? buildSnippet(row.aliases.join(' / '), terms) : null
      hits.push({
        kind,
        id: row.id,
        title: row.title,
        matched: match.matched,
        snippet: buildSnippet(row.body, terms) ?? buildSnippet(row.field, terms) ?? aliasSnippet ?? undefined,
        score: match.score,
        updatedAt: row.updatedAt,
        avatarUrl: row.avatarUrl,
      })
    }
    if (hits.length === 0) continue

    hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, 'zh-Hans'))
    groups.push({ kind, label: SEARCH_KIND_LABEL[kind], hits: hits.slice(0, perKind), total: hits.length })
  }

  return groups
}
