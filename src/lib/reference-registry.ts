import { db } from '@/lib/db'

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

const registry: Map<string, EntityTypeConfig> = new Map()

export function registerEntityType(config: EntityTypeConfig) {
  registry.set(config.type, config)
}




/**
 * 相关度排序（纯函数，`@` 与 `[[` 共用）：
 * 名字前缀 > 别名前缀 > 名字包含 > 别名包含，同分按名字（zh-Hans）。
 */
export function rankReferableEntities(entities: ReferableEntity[], query: string): ReferableEntity[] {
  const q = query.trim().toLowerCase()
  const scored: Array<{ entity: ReferableEntity; score: number }> = []

  for (const entity of entities) {
    const name = entity.name.toLowerCase()
    const aliases = (Array.isArray(entity.keywords) ? entity.keywords : []).map((kw) => kw.toLowerCase())

    if (q === '') {
      scored.push({ entity, score: 0 })
      continue
    }
    let score = Number.POSITIVE_INFINITY
    if (name.startsWith(q)) score = 0
    else if (aliases.some((alias) => alias.startsWith(q))) score = 1
    else if (name.includes(q)) score = 2
    else if (aliases.some((alias) => alias.includes(q))) score = 3
    if (score !== Number.POSITIVE_INFINITY) scored.push({ entity, score })
  }

  scored.sort(
    (a, b) => a.score - b.score || a.entity.name.localeCompare(b.entity.name, 'zh-Hans'),
  )
  return scored.slice(0, 50).map((item) => item.entity)
}

/**
 * 全局引用补全（`@` 与 `[[` 共用）。
 *
 * 以前每类写死 4 条、总共 16 条，类目一多就“只显示几个”。现在不再按类型截断，
 * 上限只留给 UI（50 条）—— 20 个角色 + 20 个词条时都能看到。
 */
export async function searchAllEntitiesFlat(query: string): Promise<ReferableEntity[]> {
  const all: ReferableEntity[] = []
  for (const [, config] of registry) {
    all.push(...(await config.fetch()))
  }
  return rankReferableEntities(all, query)
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
