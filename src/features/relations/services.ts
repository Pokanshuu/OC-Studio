import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { addCountryCharacter, addCountryEvent, removeCountryCharacter } from '@/lib/membership'
import type { GraphNode, GraphEdge, RelationEndpoint, RelationNodeType } from './types'

export type CreateRelationResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'duplicate' | 'missing' }

export async function buildGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [charactersRaw, eventsRaw, countriesRaw] = await Promise.all([
    db.characters.toArray(),
    db.events.toArray(),
    db.countries.toArray(),
  ])

  const characters = charactersRaw.filter((c) => !c.deleted)
  const events = eventsRaw.filter((e) => !e.deleted)
  const countries = countriesRaw.filter((c) => !c.deleted)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()
  const edgeKeys = new Set<string>()

  function addNode(
    id: string,
    label: string,
    type: 'character' | 'event' | 'country',
    entityId: number,
    subtitle?: string,
    position?: { x: number; y: number },
  ) {
    if (nodeIds.has(id)) return
    nodeIds.add(id)
    nodes.push({
      id,
      type: `${type}Node`,
      // 实体里存过坐标就用它；没有就交给力导向布局（见 layout.ts）
      position: position ?? { x: 0, y: 0 },
      // `group`：连线手柄靠它做「悬停节点才显形」（见 NODE_HANDLE）
      className: 'group',
      data: { id, label, entityType: type, entityId, subtitle },
    })
  }

  function addEdge(source: string, target: string, relation: string, incomplete = false) {
    // 按无序节点对去重：同一对节点只保留一条边，避免「属于/所属」「发生于/发生地」等
    // 在数据模型两侧同时表达时被重复绘制成两条反向边。
    const key = [source, target].sort().join('||')
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: 'relationEdge',
      data: incomplete ? { relation, incomplete: true } : { relation },
    })
  }

  // 成员关系在数据模型里是**两份列表**（角色侧国籍 / 国家侧相关角色、事件侧国家 / 国家侧相关事件）。
  // 只有一侧有记录时，这条边是「不完整的」——关系图允许重新拖一次把它补全
  // （见 RelationGraph 的 isValidConnection 与下面的 link* 系列）。
  const membershipSides = new Map<string, number>()
  function markMembership(a: string, b: string, side: 1 | 2) {
    const key = [a, b].sort().join('||')
    membershipSides.set(key, (membershipSides.get(key) ?? 0) | side)
  }
  function isMembershipComplete(a: string, b: string): boolean {
    return (membershipSides.get([a, b].sort().join('||')) ?? 0) === 3
  }

  for (const c of characters) {
    const id = `character-${c.id}`
    const subtitle = c.aliases?.length > 0 ? c.aliases.join('、') : undefined
    addNode(id, c.name, 'character', c.id, subtitle, c.graphPosition)
    const node = nodes.find((n) => n.id === id)
    if (node) {
      const data = node.data as Record<string, unknown>
      data.avatarUrl = c.avatarUrl
    }
  }

  for (const e of events) {
    addNode(`event-${e.id}`, e.title, 'event', e.id, e.time, e.graphPosition)
  }

  for (const c of countries) {
    addNode(`country-${c.id}`, c.name, 'country', c.id, undefined, c.graphPosition)
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

  // 事件之间的关系（编辑器「相关事件」/ 关系图拖拽连线写的就是这个字段）
  for (const e of events) {
    const sourceId = `event-${e.id}`
    for (const relation of e.relations ?? []) {
      const targetId = `event-${relation.targetId}`
      if (nodeIds.has(targetId)) {
        addEdge(sourceId, targetId, relation.relation || '')
      }
    }
  }

  // 先把「两侧都有」的成员关系登记一遍，画边时据此判断这条边完不完整
  for (const c of characters) {
    if (c.countryId) markMembership(`character-${c.id}`, `country-${c.countryId}`, 1)
  }
  for (const c of countries) {
    for (const charId of c.characters ?? []) markMembership(`country-${c.id}`, `character-${charId}`, 2)
  }
  for (const e of events) {
    for (const countryId of e.countries ?? []) markMembership(`event-${e.id}`, `country-${countryId}`, 1)
  }
  for (const c of countries) {
    for (const eventId of c.events ?? []) markMembership(`country-${c.id}`, `event-${eventId}`, 2)
  }

  for (const c of characters) {
    if (c.countryId) {
      const countryId = `country-${c.countryId}`
      if (nodeIds.has(countryId)) {
        addEdge(`character-${c.id}`, countryId, '属于', !isMembershipComplete(`character-${c.id}`, countryId))
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
        addEdge(eventId, countryNodeId, '发生于', !isMembershipComplete(eventId, countryNodeId))
      }
    }
  }

  for (const c of countries) {
    const countryId = `country-${c.id}`
    for (const charId of c.characters ?? []) {
      const charNodeId = `character-${charId}`
      if (nodeIds.has(charNodeId)) {
        addEdge(countryId, charNodeId, '所属', !isMembershipComplete(countryId, charNodeId))
      }
    }
  }

  for (const c of countries) {
    const countryId = `country-${c.id}`
    for (const eventId of c.events ?? []) {
      const eventNodeId = `event-${eventId}`
      if (nodeIds.has(eventNodeId)) {
        addEdge(countryId, eventNodeId, '发生地', !isMembershipComplete(countryId, eventNodeId))
      }
    }
  }

  return { nodes, edges }
}

/* ── 节点坐标 ─────────────────────────────────────────────── */

/**
 * 把节点的新坐标写回实体（拖拽结束时调用）。
 *
 * 刻意**不动 `updatedAt`**：排个版不是内容编辑，不该让它窜到「最近更新」最前面
 * （与 `reorderEvents` 同一口径）。仓库模式下 `vault-persist` 挂在 Dexie 中间件上，
 * 所以这一下写入会自动把 frontmatter 的 `graph_position` 落盘。
 */
export async function saveNodePosition(
  entityType: RelationNodeType,
  entityId: number,
  x: number,
  y: number,
): Promise<void> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const now = Date.now()
  const updates = {
    graphPosition: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    ...pendingStamp(now),
  }
  switch (entityType) {
    case 'character':
      await db.characters.update(entityId, updates)
      break
    case 'event':
      await db.events.update(entityId, updates)
      break
    case 'country':
      await db.countries.update(entityId, updates)
      break
  }
}

/* ── 成员关系：两侧都写 ─────────────────────────────────────
   角色的国籍（`character.countryId`）与国家的相关角色（`country.characters`）是**两份独立列表**；
   事件的国家（`event.countries`）与国家的相关事件（`country.events`）同理。
   只写一侧 → 另一侧编辑器里看不到这条关系（「拖完只在国家里出现、角色国籍仍为空」就是这么来的）。
   所以成员关系一律**两边都写**。换国籍时把旧国家列表里的这一条摘掉，图上才不会还连着旧国家。
   方向性关系（角色↔角色、事件↔事件）不镜像：师徒 / 前因这类是有方向的，只写在起手的那一端。 */

async function linkCharacterToCountry(
  characterId: number,
  countryId: number,
  now: number,
): Promise<CreateRelationResult> {
  const [character, country] = await Promise.all([
    db.characters.get(characterId),
    db.countries.get(countryId),
  ])
  if (!character || !country) return { ok: false, reason: 'missing' }

  const previousCountryId = character.countryId ?? null
  const listed = (country.characters ?? []).includes(character.id)
  if (previousCountryId === country.id && listed) return { ok: false, reason: 'duplicate' }

  // 国家侧：相关角色（补上目标国、从旧国摘掉 —— 国籍是单值，旧的那条已经不算数）
  if (!listed) await addCountryCharacter(country.id, character.id, now)
  if (previousCountryId !== null && previousCountryId !== country.id) {
    await removeCountryCharacter(previousCountryId, character.id, now)
  }

  // 角色侧：国籍
  if (previousCountryId !== country.id) {
    await db.characters.update(character.id, { countryId: country.id, updatedAt: now, ...pendingStamp(now) })
    await logOperation('characters', character.id, 'countryId', String(previousCountryId ?? ''), String(country.id))
  }

  return { ok: true }
}

async function linkEventToCountry(
  eventId: number,
  countryId: number,
  now: number,
): Promise<CreateRelationResult> {
  const [event, country] = await Promise.all([
    db.events.get(eventId),
    db.countries.get(countryId),
  ])
  if (!event || !country) return { ok: false, reason: 'missing' }

  const eventList = event.countries ?? []
  const inEvent = eventList.includes(country.id)
  const inCountry = (country.events ?? []).includes(event.id)
  if (inEvent && inCountry) return { ok: false, reason: 'duplicate' }

  // 事件侧：相关国家
  if (!inEvent) {
    const next = [...eventList, country.id]
    await db.events.update(event.id, { countries: next, updatedAt: now, ...pendingStamp(now) })
    await logOperation('events', event.id, 'countries', JSON.stringify(eventList), JSON.stringify(next))
  }
  // 国家侧：相关事件（幂等）
  await addCountryEvent(country.id, event.id, now)

  return { ok: true }
}

/** 角色参与事件：只有事件侧持有名单，角色没有反向列表 */
async function linkCharacterToEvent(
  eventId: number,
  characterId: number,
  now: number,
): Promise<CreateRelationResult> {
  const [event, character] = await Promise.all([
    db.events.get(eventId),
    db.characters.get(characterId),
  ])
  if (!event || !character) return { ok: false, reason: 'missing' }

  const list = event.characters ?? []
  if (list.includes(character.id)) return { ok: false, reason: 'duplicate' }
  const next = [...list, character.id]
  await db.events.update(event.id, { characters: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('events', event.id, 'characters', JSON.stringify(list), JSON.stringify(next))
  return { ok: true }
}

/**
 * 在关系图上拖一条线 → 落库。
 *
 * 映射表与 `relationPlan`（relation-graph-utils）一一对应：不新造关系表，
 * 直接写回实体字段，因此编辑器、vault frontmatter、导出站看到的都是同一份数据。
 * 成员关系两边都写（见上面的 link* 系列），方向性关系只写起手的那一端。
 */
export async function createRelationBetween(
  source: RelationEndpoint,
  target: RelationEndpoint,
  relation: string,
): Promise<CreateRelationResult> {
  if (source.entityType === target.entityType && source.entityId === target.entityId) {
    return { ok: false, reason: 'unsupported' }
  }

  const now = Date.now()
  const label = relation.trim()
  const pair = `${source.entityType}:${target.entityType}`

  switch (pair) {
    case 'character:character': {
      const [from, to] = await Promise.all([
        db.characters.get(source.entityId),
        db.characters.get(target.entityId),
      ])
      if (!from || !to) return { ok: false, reason: 'missing' }
      const list = from.relatedCharacters ?? []
      if (list.some((item) => item.characterId === to.id)) return { ok: false, reason: 'duplicate' }
      const next = [...list, { characterId: to.id, name: to.name, relation: label }]
      await db.characters.update(from.id, {
        relatedCharacters: next,
        updatedAt: now,
        ...pendingStamp(now),
      })
      await logOperation('characters', from.id, 'relatedCharacters', JSON.stringify(list), JSON.stringify(next))
      return { ok: true }
    }

    case 'character:event':
      return linkCharacterToEvent(target.entityId, source.entityId, now)

    case 'event:character':
      return linkCharacterToEvent(source.entityId, target.entityId, now)

    case 'character:country':
      return linkCharacterToCountry(source.entityId, target.entityId, now)

    case 'country:character':
      return linkCharacterToCountry(target.entityId, source.entityId, now)

    case 'event:event': {
      const [from, to] = await Promise.all([
        db.events.get(source.entityId),
        db.events.get(target.entityId),
      ])
      if (!from || !to) return { ok: false, reason: 'missing' }
      const list = from.relations ?? []
      if (list.some((item) => item.targetId === to.id)) return { ok: false, reason: 'duplicate' }
      const next = [...list, { targetId: to.id, relation: label }]
      await db.events.update(from.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('events', from.id, 'relations', JSON.stringify(list), JSON.stringify(next))
      return { ok: true }
    }

    case 'event:country':
      return linkEventToCountry(source.entityId, target.entityId, now)

    case 'country:event':
      return linkEventToCountry(target.entityId, source.entityId, now)

    default:
      // 国家之间没有对应字段（既没有父级外的关联表，也没有反向列表）
      return { ok: false, reason: 'unsupported' }
  }
}
