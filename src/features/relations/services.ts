import { db } from '@/lib/db'
import type { GraphNode, GraphEdge } from './types'

export async function buildGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [charactersRaw, eventsRaw, countriesRaw] = await Promise.all([
    db.characters.toArray(),
    db.events.toArray(),
    db.countries.toArray(),
  ])

  const characters = charactersRaw.filter((c) => !c.deleted)
  const events = eventsRaw.filter((e) => e.deleted === 0)
  const countries = countriesRaw.filter((c) => !c.deleted)

  console.log('[buildGraphData] 开始聚合数据', {
    charactersCount: characters.length,
    eventsCount: events.length,
    countriesCount: countries.length,
    示例角色: characters[0]?.name,
    示例角色deleted: characters[0]?.deleted,
  })

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()

  function addNode(id: string, label: string, type: 'character' | 'event' | 'country', entityId: number, subtitle?: string) {
    if (nodeIds.has(id)) return
    nodeIds.add(id)
    nodes.push({
      id,
      type: `${type}Node`,
      position: { x: 0, y: 0 },
      data: { id, label, entityType: type, entityId, subtitle },
    })
  }

  function addEdge(source: string, target: string, relation: string) {
    const edgeId = `${source}->${target}`
    if (edges.find((e) => e.id === edgeId)) return
    edges.push({
      id: edgeId,
      source,
      target,
      type: 'relationEdge',
      data: { relation },
    })
  }

  for (const c of characters) {
    const id = `character-${c.id}`
    const subtitle = c.aliases?.length > 0 ? c.aliases.join('、') : undefined
    addNode(id, c.name, 'character', c.id as number, subtitle)
    const node = nodes.find((n) => n.id === id)
    if (node) {
      const data = node.data as Record<string, unknown>
      data.avatarUrl = c.avatarUrl
      data.qAvatarUrl = c.qAvatarUrl ?? ''
    }
  }

  for (const e of events) {
    addNode(`event-${e.id}`, e.title, 'event', e.id as number, e.time || undefined)
  }

  for (const c of countries) {
    addNode(`country-${c.id}`, c.name, 'country', c.id as number)
    const node = nodes.find((n) => n.id === `country-${c.id}`)
    if (node) {
      ;(node.data as Record<string, unknown>).flagUrl = c.flagUrl ?? ''
    }
  }

  for (const c of characters) {
    const sourceId = `character-${c.id}`
    for (const rc of c.relatedCharacters ?? []) {
      const targetId = `character-${rc.characterId}`
      if (nodeIds.has(targetId)) {
        addEdge(sourceId, targetId, rc.relation || '')
      }
    }
  }

  for (const c of characters) {
    if (c.countryId) {
      const countryId = `country-${c.countryId}`
      if (nodeIds.has(countryId)) {
        addEdge(`character-${c.id}`, countryId, '属于')
      }
    }
  }

  for (const e of events) {
    const eventId = `event-${e.id}`
    for (const charId of e.characters ?? []) {
      const charNodeId = `character-${charId}`
      if (nodeIds.has(charNodeId)) {
        addEdge(eventId, charNodeId, '参与')
      }
    }
  }

  for (const e of events) {
    const eventId = `event-${e.id}`
    for (const countryId of e.countries ?? []) {
      const countryNodeId = `country-${countryId}`
      if (nodeIds.has(countryNodeId)) {
        addEdge(eventId, countryNodeId, '发生于')
      }
    }
  }

  for (const c of countries) {
    const countryId = `country-${c.id}`
    for (const charId of c.characters ?? []) {
      const charNodeId = `character-${charId}`
      if (nodeIds.has(charNodeId)) {
        addEdge(countryId, charNodeId, '所属')
      }
    }
  }

  for (const c of countries) {
    const countryId = `country-${c.id}`
    for (const eventId of c.events ?? []) {
      const eventNodeId = `event-${eventId}`
      if (nodeIds.has(eventNodeId)) {
        addEdge(countryId, eventNodeId, '发生地')
      }
    }
  }

  return { nodes, edges }
}
