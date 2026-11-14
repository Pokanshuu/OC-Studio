import { db } from '@/lib/db'
import { isLatinQuery, pinyinInitials } from '@/lib/pinyin-initials'

export interface ReferableEntity {
  type: string
  id: string
  name: string
  keywords: string[]
  avatarUrl?: string
}

export interface EntityTypeConfig {
  type: string
  label: string
  fetch: () => Promise<ReferableEntity[]>
}

/** 补全结果上限（`@` 与 `[[` 共用）。超过上限的条目需继续输入以缩小范围 */
export const REFERABLE_RESULT_LIMIT = 200

const registry: Map<string, EntityTypeConfig> = new Map()

export function registerEntityType(config: EntityTypeConfig) {
  registry.set(config.type, config)
}

/**
 * 相关度排序（纯函数，`@` 与 `[[` 共用）：
 * 名字前缀 > 名字拼音首字母 > 别名前缀 > 别名拼音首字母 > 名字包含 > 别名包含，
 * 同分按名字（zh-Hans）。
 *
 * 拼音首字母只对纯拉丁字母的查询生效（`al` 命中「艾拉」、`k` 命中「凯尔」）；
 * 汉字查询仍走字面匹配，因此「打首字母」与「打首字」两种输入习惯都可用。
 * `limit` 为截断上限，传入 `Number.POSITIVE_INFINITY` 可取回全部命中（统计用）。
 */
export function rankReferableEntities(
  entities: ReferableEntity[],
  query: string,
  limit: number = REFERABLE_RESULT_LIMIT,
): ReferableEntity[] {
  const q = query.trim().toLowerCase()
  const matchByInitials = q !== '' && isLatinQuery(q)
  const scored: Array<{ entity: ReferableEntity; score: number }> = []

  for (const entity of entities) {
    if (q === '') {
      scored.push({ entity, score: 0 })
      continue
    }

    const name = entity.name.toLowerCase()
    const keywords = Array.isArray(entity.keywords) ? entity.keywords : []
    const aliases = keywords.map((keyword) => keyword.toLowerCase())
    const nameInitials = matchByInitials ? pinyinInitials(entity.name) : ''
    const aliasInitials = matchByInitials ? keywords.map((keyword) => pinyinInitials(keyword)) : []

    let score = Number.POSITIVE_INFINITY
    if (name.startsWith(q)) score = 0
    else if (nameInitials !== '' && nameInitials.startsWith(q)) score = 1
    else if (aliases.some((alias) => alias.startsWith(q))) score = 2
    else if (aliasInitials.some((initials) => initials !== '' && initials.startsWith(q))) score = 3
    else if (name.includes(q)) score = 4
    else if (aliases.some((alias) => alias.includes(q))) score = 5
    if (score !== Number.POSITIVE_INFINITY) scored.push({ entity, score })
  }

  scored.sort(
    (a, b) => a.score - b.score || a.entity.name.localeCompare(b.entity.name, 'zh-Hans'),
  )
  return scored.slice(0, limit).map((item) => item.entity)
}

export interface ReferableSearchOptions {
  /** 只查这几类实体。过滤发生在排序与截断之前 */
  types?: readonly string[]
  /** 结果上限，默认 `REFERABLE_RESULT_LIMIT` */
  limit?: number
}

/**
 * 全局引用补全的数据入口（`@` 与 `[[` 共用）。
 *
 * 各注册表并发读取后合并，再交给 `rankReferableEntities` 排序截断。
 * 类型过滤必须在这里完成：若先合并、排序、截断，再由调用方按类型挑选，
 * 名字排序靠后的整类实体会全部缺失（大库输入 `[[` 时词条列表为空即由此产生）。
 */
export async function searchReferableEntities(
  query: string,
  options: ReferableSearchOptions = {},
): Promise<ReferableEntity[]> {
  const { types, limit } = options
  const configs = [...registry.values()].filter((config) => !types || types.includes(config.type))
  const lists = await Promise.all(configs.map((config) => config.fetch()))
  return rankReferableEntities(lists.flat(), query, limit)
}

registerEntityType({
  type: 'character',
  label: '角色',
  fetch: async () => {
    const all = await db.characters.orderBy('name').toArray()
    return all
      .filter((c) => !c.deleted)
      .map((c) => ({
        type: 'character',
        id: String(c.id),
        name: c.name,
        keywords: Array.isArray(c.aliases) ? c.aliases : [],
        avatarUrl: c.avatarUrl || undefined,
      }))
  },
})

registerEntityType({
  type: 'event',
  label: '事件',
  fetch: async () => {
    const all = await db.events.orderBy('title').toArray()
    return all
      .filter((e) => !e.deleted)
      .map((e) => ({
        type: 'event',
        id: String(e.id),
        name: e.title,
        keywords: [e.location, e.time].filter(Boolean),
      }))
  },
})

registerEntityType({
  type: 'country',
  label: '国家',
  fetch: async () => {
    const all = await db.countries.orderBy('name').toArray()
    return all
      .filter((c) => !c.deleted)
      .map((c) => ({
        type: 'country',
        id: String(c.id),
        name: c.name,
        keywords: [c.system].filter(Boolean),
        avatarUrl: c.flagUrl || undefined,
      }))
  },
})

registerEntityType({
  type: 'world',
  label: '词条',
  fetch: async () => {
    const all = await db.worldEntries.orderBy('title').toArray()
    return all
      .filter((w) => !w.deleted)
      .map((w) => ({
        type: 'world',
        id: String(w.id),
        name: w.title,
        keywords: w.aliases ?? [],
      }))
  },
})
