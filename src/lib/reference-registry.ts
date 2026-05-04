import { db } from '@/lib/db'

export interface ReferableEntity {
  type: string
  id: string
  name: string
  keywords: string[]
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

export function unregisterEntityType(type: string) {
  registry.delete(type)
}

export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys())
}

export async function searchEntities(query: string): Promise<Record<string, ReferableEntity[]>> {
  const result: Record<string, ReferableEntity[]> = {}
  const q = query.toLowerCase()

  for (const [type, config] of registry) {
    let entities = await config.fetch()
    if (q) {
      entities = entities.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (Array.isArray(e.keywords) && e.keywords.some((kw) => kw.toLowerCase().includes(q))),
      )
    }
    result[type] = entities
  }

  return result
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
      }))
  },
})
