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




export async function searchAllEntitiesFlat(query: string): Promise<ReferableEntity[]> {
  const result: ReferableEntity[] = []
  const q = query ? query.toLowerCase() : ''

  for (const [, config] of registry) {
    let entities = await config.fetch()
    if (q) {
      entities = entities.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (Array.isArray(e.keywords) && e.keywords.some((kw) => kw.toLowerCase().includes(q))),
      )
    }
    result.push(...entities.slice(0, 4))
  }

  return result.slice(0, 16)
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
