import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { isCodexEntry } from '@/lib/entry-kinds'
import type { Character } from '@/types'
import type { GraphEdgeKind, GraphNode, GraphEdge, RelationEndpoint, RelationNodeType } from './types'
import {
  patchCharacterEdge,
  patchCharacterNoteEdge,
  patchEventEdge,
  patchWorldEdge,
  type EdgeStylePatch,
} from './edge-style'
import { deleteCharacter, updateCharacter } from '@/features/characters/services'
import { deleteCountry, updateCountry } from '@/features/countries/services'
import { deleteEvent, updateEvent } from '@/features/events/services'
import { deleteEntry, updateEntry } from '@/features/world/services'

export type CreateRelationResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'duplicate' | 'missing' }

export async function buildGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const [charactersRaw, eventsRaw, countriesRaw, worldsRaw] = await Promise.all([
    db.characters.toArray(),
    db.events.toArray(),
    db.countries.toArray(),
    db.worldEntries.toArray(),
  ])

  const characters = charactersRaw.filter((c) => !c.deleted)
  const events = eventsRaw.filter((e) => !e.deleted)
  const countries = countriesRaw.filter((c) => !c.deleted)
  // 只把「有关系的分类条目」放进图里：没有边 / 引用的笔记放进来只会变孤岛；
  // 小说 / 地图笔记不算分类条目。目标端也要进来，否则 A→B 只有 A 有边时 B 不在图上。
  const worldById = new Map(worldsRaw.map((entry) => [entry.id, entry]))
  const graphWorldIds = new Set<number>()
  for (const entry of worldsRaw) {
    if (
      entry.deleted ||
      !entry.category ||
      !isCodexEntry(entry) ||
      ((entry.references?.length ?? 0) === 0 && (entry.relations?.length ?? 0) === 0)
    ) {
      continue
    }
    graphWorldIds.add(entry.id)
    for (const relation of entry.relations ?? []) {
      const target = relation.targetId !== undefined ? worldById.get(relation.targetId) : undefined
      if (target && !target.deleted && target.category && isCodexEntry(target)) {
        graphWorldIds.add(target.id)
      }
    }
    for (const reference of entry.references ?? []) {
      if (reference.targetType !== 'world') continue
      const target = worldById.get(reference.targetId)
      if (target && !target.deleted && target.category && isCodexEntry(target)) {
        graphWorldIds.add(target.id)
      }
    }
  }
  // 角色 → 笔记：角色侧也能发起命名边，目标笔记同样要进图
  for (const character of characters) {
    for (const relation of character.relatedNotes ?? []) {
      const target =
        relation.targetId !== undefined ? worldById.get(relation.targetId) : undefined
      if (target && !target.deleted && target.category && isCodexEntry(target)) {
        graphWorldIds.add(target.id)
      }
    }
  }
  const categoryEntries = worldsRaw.filter((entry) => !entry.deleted && graphWorldIds.has(entry.id))

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()
  const edgeKeys = new Set<string>()

  function addNode(
    id: string,
    label: string,
    type: 'character' | 'event' | 'country' | 'world',
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

  function addEdge(
    source: string,
    target: string,
    relation: string,
    options: {
      /**
       * 是否允许同一对节点的多条边。
       * - 成员 / 归属类（角色↔国家、事件↔国家）：两侧数据表达同一条事实，**必须去重**
       * - 角色↔角色、事件↔事件：一个名字就是一条关系（兄弟 + 同事），去重会把其中一条吞掉
       */
      parallel?: boolean
      incomplete?: boolean
      style?: { color?: string; arrow?: 'none' | 'forward' | 'reverse' | 'both' }
      /** 语义类别：只决定线怎么画（见 types.ts 的 GraphEdgeKind） */
      kind?: GraphEdgeKind
    } = {},
  ): void {
    const { parallel = false, incomplete = false, style, kind = 'relation' } = options
    const pairKey = [source, target].sort().join('||')
    const key = parallel ? `${pairKey}::${relation}` : pairKey
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({
      // 同一对节点允许多条关系（兄弟 + 同事），id 必须带上关系名，否则 React Flow 的
      // edgeLookup 会把后一条覆盖掉（PR #5 #1 的前提）
      id: parallel ? `${source}->${target}::${relation}` : `${source}->${target}`,
      source,
      target,
      type: 'relationEdge',
      data: {
        relation,
        kind,
        ...(incomplete ? { incomplete: true } : {}),
        ...(style?.color ? { color: style.color } : {}),
        ...(style?.arrow ? { arrow: style.arrow } : {}),
      },
    })
  }

  // 成员关系只有一份（阶段二·一）：边永远完整，没有「只写了一半」的状态要对齐。

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
    const node = nodes.find((n) => n.id === `event-${e.id}`)
    if (node) {
      ;(node.data as Record<string, unknown>).imageUrl = e.headerUrl ?? ''
    }
  }

  for (const c of countries) {
    addNode(`country-${c.id}`, c.name, 'country', c.id, undefined, c.graphPosition)
    const node = nodes.find((n) => n.id === `country-${c.id}`)
    if (node) {
      ;(node.data as Record<string, unknown>).flagUrl = c.flagUrl ?? ''
    }
  }

  for (const entry of categoryEntries) {
    addNode(`world-${entry.id}`, entry.title, 'world', entry.id, entry.category, entry.graphPosition)
    const node = nodes.find((n) => n.id === `world-${entry.id}`)
    if (node) {
      ;(node.data as Record<string, unknown>).flagUrl = entry.cover ?? ''
    }
  }

  for (const c of characters) {
    const sourceId = `character-${c.id}`
    for (const rc of c.relatedCharacters ?? []) {
      const targetId = `character-${rc.characterId}`
      if (nodeIds.has(targetId)) {
        // 角色之间的关系默认双向箭头（docs/关系图.md §2.1），显式存过就以存的为准
        addEdge(sourceId, targetId, rc.relation || '', {
          parallel: true,
          style: { color: rc.color, arrow: rc.arrow ?? 'both' },
        })
      }
    }
  }

  // 事件之间的关系（编辑器「相关事件」/ 关系图拖拽连线写的就是这个字段）
  for (const e of events) {
    const sourceId = `event-${e.id}`
    for (const relation of e.relations ?? []) {
      const targetId = `event-${relation.targetId}`
      if (nodeIds.has(targetId)) {
        addEdge(sourceId, targetId, relation.relation || '', {
          parallel: true,
          style: { color: relation.color, arrow: relation.arrow },
        })
      }
    }
  }

  // 角色 → 笔记的命名边（角色关系块「相关笔记」写的就是这个字段）
  for (const c of characters) {
    const sourceId = `character-${c.id}`
    for (const relation of c.relatedNotes ?? []) {
      if (relation.targetId === undefined) continue
      const targetId = `world-${relation.targetId}`
      if (!nodeIds.has(targetId)) continue
      addEdge(sourceId, targetId, relation.relation || '相关', {
        parallel: true,
        style: { color: relation.color, arrow: relation.arrow },
      })
    }
  }

  // 分类条目之间的命名关系（关系块「添加」写的就是这个字段）
  for (const entry of categoryEntries) {
    const sourceId = `world-${entry.id}`
    for (const relation of entry.relations ?? []) {
      if (relation.targetId === undefined) continue
      const targetId = `world-${relation.targetId}`
      if (!nodeIds.has(targetId)) continue
      addEdge(sourceId, targetId, relation.relation || '相关', {
        parallel: true,
        style: { color: relation.color, arrow: relation.arrow },
      })
    }
  }

  // 分类条目 → 被引用实体（@ 引用 / [[内链]] 落在 references 上）
  for (const entry of categoryEntries) {
    const sourceId = `world-${entry.id}`
    for (const reference of entry.references ?? []) {
      const targetId = `${reference.targetType}-${reference.targetId}`
      if (reference.targetType !== 'world' && reference.targetType !== 'character' && reference.targetType !== 'event' && reference.targetType !== 'country') continue
      if (nodeIds.has(targetId)) {
        addEdge(sourceId, targetId, '引用', {
          parallel: true,
          incomplete: true,
          style: { arrow: 'forward' },
          kind: 'reference',
        })
      }
    }
  }

  // 并行边错开：同一对节点的第 n 条关系给一个序号（docs/关系图.md §9 风险 3）
  const pairCount = new Map<string, number>()
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('||')
    if (edgeKeys.has(key + '::member')) continue
    const index = pairCount.get(key) ?? 0
    pairCount.set(key, index + 1)
    if (edge.data) edge.data.parallelIndex = index
  }

  // 成员关系只有一份（阶段二·一）：角色→国家「属于」、事件→国家「发生于」。
  // 以前两侧各存一份名单、各画一条边，靠 `markMembership` 判断「两侧都有」再去重；
  // 国家的名单退役后，这些边天然完整，不需要那套判定。
  for (const c of characters) {
    if (c.countryId) {
      const countryId = `country-${c.countryId}`
      if (nodeIds.has(countryId)) {
        addEdge(`character-${c.id}`, countryId, '属于', { kind: 'member' })
      }
    }
  }

  for (const e of events) {
    const eventId = `event-${e.id}`
    for (const charId of e.characters ?? []) {
      const charNodeId = `character-${charId}`
      if (nodeIds.has(charNodeId)) {
        addEdge(eventId, charNodeId, '参与', { kind: 'member' })
      }
    }
  }

  for (const e of events) {
    const eventId = `event-${e.id}`
    for (const countryId of e.countries ?? []) {
      const countryNodeId = `country-${countryId}`
      if (nodeIds.has(countryNodeId)) {
        addEdge(eventId, countryNodeId, '发生于', { kind: 'member' })
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
    case 'world':
      await db.worldEntries.update(entityId, updates)
      break
  }
}

/* ── 成员关系：只写权威侧 ─────────────────────────────────────
   阶段二·一之后，成员关系**只有一份**：角色的国籍（`character.countryId`）、
   事件的相关国家（`event.countries`）。国家页的「相关角色 / 相关事件」是查询出来的，
   不再有 `country.characters` / `country.events` 需要同步（旧键不读不写不删）。
   方向性关系（角色↔角色、事件↔事件）本来也不镜像：师徒 / 前因只写在起手的那一端。 */

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
  if (previousCountryId === country.id) return { ok: false, reason: 'duplicate' }

  // 国籍是单值：换过去就等于从旧国家摘掉了，没有第二份列表要维护
  await db.characters.update(character.id, { countryId: country.id, updatedAt: now, ...pendingStamp(now) })
  await logOperation('characters', character.id, 'countryId', String(previousCountryId ?? ''), String(country.id))

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
  if (eventList.includes(country.id)) return { ok: false, reason: 'duplicate' }

  const next = [...eventList, country.id]
  await db.events.update(event.id, { countries: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('events', event.id, 'countries', JSON.stringify(eventList), JSON.stringify(next))

  return { ok: true }
}

/** 角色 → 笔记：关系存在角色侧，笔记那边查出来 */
async function linkCharacterToNote(
  characterId: number,
  entryId: number,
  label: string,
  now: number,
): Promise<CreateRelationResult> {
  const [character, entry] = await Promise.all([
    db.characters.get(characterId),
    db.worldEntries.get(entryId),
  ])
  if (!character || !entry) return { ok: false, reason: 'missing' }
  const list = character.relatedNotes ?? []
  if (list.some((item) => item.targetId === entry.id && (item.relation ?? '').trim() === label)) {
    return { ok: false, reason: 'duplicate' }
  }
  const next = [...list, { targetId: entry.id, name: entry.title, relation: label }]
  await db.characters.update(character.id, {
    relatedNotes: next,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await logOperation('characters', character.id, 'relatedNotes', JSON.stringify(list), JSON.stringify(next))
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
      // 同一对角色可以有多条不同名字的关系（兄弟 + 同事）；同名才算重复
      if (list.some((item) => item.characterId === to.id && (item.relation ?? '').trim() === label)) {
        return { ok: false, reason: 'duplicate' }
      }
      const next = [
        ...list,
        { characterId: to.id, name: to.name, relation: label, arrow: 'both' as const },
      ]
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
      if (list.some((item) => item.targetId === to.id && (item.relation ?? '').trim() === label)) {
        return { ok: false, reason: 'duplicate' }
      }
      const next = [...list, { targetId: to.id, relation: label }]
      await db.events.update(from.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('events', from.id, 'relations', JSON.stringify(list), JSON.stringify(next))
      return { ok: true }
    }

    case 'world:world': {
      const [from, to] = await Promise.all([
        db.worldEntries.get(source.entityId),
        db.worldEntries.get(target.entityId),
      ])
      if (!from || !to) return { ok: false, reason: 'missing' }
      const list = from.relations ?? []
      // 同一对笔记可以有多条不同名字的关系；同名才算重复
      if (list.some((item) => item.targetId === to.id && (item.relation ?? '').trim() === label)) {
        return { ok: false, reason: 'duplicate' }
      }
      const next = [...list, { targetId: to.id, name: to.title, relation: label }]
      await db.worldEntries.update(from.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('worldEntries', from.id, 'relations', JSON.stringify(list), JSON.stringify(next))
      return { ok: true }
    }

    case 'character:world': {
      return linkCharacterToNote(source.entityId, target.entityId, label, now)
    }

    case 'world:character': {
      return linkCharacterToNote(target.entityId, source.entityId, label, now)
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


/**
 * 改一条边的样式（颜色 / 箭头）。支持命名边：角色↔角色、事件↔事件、笔记↔笔记，
 * 以及角色→笔记（关系存在角色侧的 `relatedNotes`）。
 */
export async function updateEdgeStyle(
  source: { entityType: RelationNodeType; entityId: number },
  target: { entityType: RelationNodeType; entityId: number },
  patch: EdgeStylePatch,
): Promise<boolean> {
  const now = Date.now()

  // 角色 → 笔记：边存在角色侧，source 可能是任意一端
  if (
    (source.entityType === 'character' && target.entityType === 'world') ||
    (source.entityType === 'world' && target.entityType === 'character')
  ) {
    const characterId =
      source.entityType === 'character' ? source.entityId : target.entityId
    const entryId = source.entityType === 'world' ? source.entityId : target.entityId
    const row = await db.characters.get(characterId)
    if (!row) return false
    const patched = patchCharacterNoteEdge(row, entryId, patch)
    if (!patched || !patched.changed) return patched?.found ?? false
    await db.characters.update(row.id, {
      relatedNotes: patched.relatedNotes,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation('characters', row.id, 'edge_style', '', JSON.stringify(patch))
    return true
  }

  if (source.entityType !== target.entityType) return false

  if (source.entityType === 'character') {
    const row = await db.characters.get(source.entityId)
    if (!row) return false
    const patched = patchCharacterEdge(row, target.entityId, patch)
    if (!patched || !patched.changed) return patched?.found ?? false
    await db.characters.update(row.id, {
      relatedCharacters: patched.relatedCharacters,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation('characters', row.id, 'edge_style', '', JSON.stringify(patch))
    return true
  }

  if (source.entityType === 'event') {
    const row = await db.events.get(source.entityId)
    if (!row) return false
    const patched = patchEventEdge(row, target.entityId, patch)
    if (!patched || !patched.changed) return patched?.found ?? false
    await db.events.update(row.id, {
      relations: patched.relations,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation('events', row.id, 'edge_style', '', JSON.stringify(patch))
    return true
  }

  if (source.entityType === 'world') {
    const row = await db.worldEntries.get(source.entityId)
    if (!row) return false
    const patched = patchWorldEdge(row, target.entityId, patch)
    if (!patched || !patched.changed) return patched?.found ?? false
    await db.worldEntries.update(row.id, {
      relations: patched.relations,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation('worldEntries', row.id, 'edge_style', '', JSON.stringify(patch))
    return true
  }

  return false
}

/* ── 删一条关系（图上的「删除这条关系」） ─────────────────────
   与 `createRelationBetween` 同一张映射表，只是反向：只动**真源那一侧**的字段。
   分类条目的「引用」是正文里 @ / [[ ]] 推出来的，图上是派生物 —— 删线不等于删正文里的引用，
   所以 `world` 参与的边一律返回 false（按钮那边也不给删除）。 */

function relationMatches(stored: string | undefined, wanted: string | undefined): boolean {
  if (wanted === undefined) return true
  return (stored ?? '') === wanted
}

/** 清掉角色的国籍（角色↔国家那条「属于」） */
async function unlinkCharacterCountry(characterId: number, countryId: number, now: number): Promise<boolean> {
  const character = await db.characters.get(characterId)
  if (!character || character.countryId !== countryId) return false
  // 国籍是单值：清空写 `null`（与 membership.ts 的 purgeCountryReferences 同一写法 ——
  // `undefined` 在 Dexie 的 update 里是不写的，要清必须落到 null）
  await db.characters.update(character.id, {
    countryId: null,
    updatedAt: now,
    ...pendingStamp(now),
  } as unknown as Partial<Character>)
  await logOperation('characters', character.id, 'countryId', String(countryId), '')
  return true
}

/** 从事件的名单里摘掉一个 id（「参与」「发生于」） */
async function unlinkEventList(
  eventId: number,
  field: 'characters' | 'countries',
  entityId: number,
  now: number,
): Promise<boolean> {
  const event = await db.events.get(eventId)
  if (!event) return false
  const list = event[field] ?? []
  const next = list.filter((id) => id !== entityId)
  if (next.length === list.length) return false
  await db.events.update(event.id, { [field]: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('events', event.id, field, JSON.stringify(list), JSON.stringify(next))
  return true
}

/**
 * 删掉一条关系。`relation` 给了就只删同名的那条（同一对角色可以有多条不同名字的关系）；
 * 不给就删这一对之间的全部。
 */
export async function deleteRelationBetween(
  source: RelationEndpoint,
  target: RelationEndpoint,
  relation?: string,
): Promise<boolean> {
  const now = Date.now()
  const pair = `${source.entityType}:${target.entityType}`

  switch (pair) {
    case 'character:character': {
      const from = await db.characters.get(source.entityId)
      if (from) {
        const list = from.relatedCharacters ?? []
        const next = list.filter(
          (item) => !(item.characterId === target.entityId && relationMatches(item.relation, relation)),
        )
        if (next.length !== list.length) {
          await db.characters.update(from.id, { relatedCharacters: next, updatedAt: now, ...pendingStamp(now) })
          await logOperation('characters', from.id, 'relatedCharacters', JSON.stringify(list), JSON.stringify(next))
          return true
        }
      }
      // 这条边可能记在另一端（谁先建的边谁持有）—— 两端都试一次
      const reversed = await db.characters.get(target.entityId)
      if (!reversed) return false
      const list = reversed.relatedCharacters ?? []
      const next = list.filter(
        (item) => !(item.characterId === source.entityId && relationMatches(item.relation, relation)),
      )
      if (next.length === list.length) return false
      await db.characters.update(reversed.id, { relatedCharacters: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('characters', reversed.id, 'relatedCharacters', JSON.stringify(list), JSON.stringify(next))
      return true
    }

    case 'world:world': {
      const from = await db.worldEntries.get(source.entityId)
      if (from) {
        const list = from.relations ?? []
        const next = list.filter(
          (item) => !(item.targetId === target.entityId && relationMatches(item.relation, relation)),
        )
        if (next.length !== list.length) {
          await db.worldEntries.update(from.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
          await logOperation('worldEntries', from.id, 'relations', JSON.stringify(list), JSON.stringify(next))
          return true
        }
      }
      // 这条边可能记在另一端（谁先建的边谁持有）—— 两端都试一次
      const reversed = await db.worldEntries.get(target.entityId)
      if (!reversed) return false
      const list = reversed.relations ?? []
      const next = list.filter(
        (item) => !(item.targetId === source.entityId && relationMatches(item.relation, relation)),
      )
      if (next.length === list.length) return false
      await db.worldEntries.update(reversed.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('worldEntries', reversed.id, 'relations', JSON.stringify(list), JSON.stringify(next))
      return true
    }

    case 'character:world':
    case 'world:character': {
      const characterId =
        source.entityType === 'character' ? source.entityId : target.entityId
      const entryId = source.entityType === 'world' ? source.entityId : target.entityId
      const character = await db.characters.get(characterId)
      if (!character) return false
      const list = character.relatedNotes ?? []
      const next = list.filter(
        (item) => !(item.targetId === entryId && relationMatches(item.relation, relation)),
      )
      if (next.length === list.length) return false
      await db.characters.update(character.id, {
        relatedNotes: next,
        updatedAt: now,
        ...pendingStamp(now),
      })
      await logOperation('characters', character.id, 'relatedNotes', JSON.stringify(list), JSON.stringify(next))
      return true
    }

    case 'event:event': {
      const from = await db.events.get(source.entityId)
      if (from) {
        const list = from.relations ?? []
        const next = list.filter(
          (item) => !(item.targetId === target.entityId && relationMatches(item.relation, relation)),
        )
        if (next.length !== list.length) {
          await db.events.update(from.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
          await logOperation('events', from.id, 'relations', JSON.stringify(list), JSON.stringify(next))
          return true
        }
      }
      const reversed = await db.events.get(target.entityId)
      if (!reversed) return false
      const list = reversed.relations ?? []
      const next = list.filter(
        (item) => !(item.targetId === source.entityId && relationMatches(item.relation, relation)),
      )
      if (next.length === list.length) return false
      await db.events.update(reversed.id, { relations: next, updatedAt: now, ...pendingStamp(now) })
      await logOperation('events', reversed.id, 'relations', JSON.stringify(list), JSON.stringify(next))
      return true
    }

    case 'character:event':
      return unlinkEventList(target.entityId, 'characters', source.entityId, now)

    case 'event:character':
      return unlinkEventList(source.entityId, 'characters', target.entityId, now)

    case 'character:country':
      return unlinkCharacterCountry(source.entityId, target.entityId, now)

    case 'country:character':
      return unlinkCharacterCountry(target.entityId, source.entityId, now)

    case 'event:country':
      return unlinkEventList(source.entityId, 'countries', target.entityId, now)

    case 'country:event':
      return unlinkEventList(target.entityId, 'countries', source.entityId, now)

    default:
      // 分类条目的「引用」不是边数据，是正文推导出来的 —— 图上的线没有对应字段可删
      return false
  }
}

/* ── 图上的节点动作 ───────────────────────────────────────── */

/**
 * 删掉一个节点（软删除，进回收站）。
 *
 * 必须走各 feature 的 `delete*`：它们负责软删除、清引用、写操作日志与回收站；
 * 直接 `db.update({ deleted: true })` 会留下指向它的关系。
 */
export async function deleteGraphNode(entityType: RelationNodeType, entityId: number): Promise<void> {
  switch (entityType) {
    case 'character':
      await deleteCharacter(entityId)
      break
    case 'event':
      await deleteEvent(entityId)
      break
    case 'country':
      await deleteCountry(entityId)
      break
    case 'world':
      await deleteEntry(entityId)
      break
  }
}

/** 换节点图（头像 / 旗帜 / 事件封面 / 分类条目封面）—— 与各编辑器的槽位一一对应 */
export async function setGraphNodeImage(
  entityType: RelationNodeType,
  entityId: number,
  path: string,
): Promise<void> {
  switch (entityType) {
    case 'character':
      await updateCharacter(entityId, { avatarUrl: path })
      break
    case 'event':
      await updateEvent(entityId, { headerUrl: path })
      break
    case 'country':
      await updateCountry(entityId, { flagUrl: path })
      break
    case 'world':
      await updateEntry(entityId, { cover: path })
      break
  }
}
