import { db } from '@/lib/db'
import type {
  Character,
  Country,
  Event,
  RelationEntityType,
  RelationKind,
  RelationRecord,
} from '@/types'
import type { GraphEdge, GraphNode } from './types'
import type { RelationArrow } from './style'

const MANAGED_KINDS: RelationKind[] = [
  'character',
  'membership',
  'event-character',
  'event-country',
  'event-event',
  'nation',
]

const DEFAULT_LABELS: Record<RelationKind, string> = {
  character: '相关',
  membership: '属于',
  'event-character': '参与',
  'event-country': '发生于',
  'event-event': '相关',
  nation: '关系',
  custom: '相关',
}

export function relationId(
  sourceType: RelationEntityType,
  sourceId: number,
  targetType: RelationEntityType,
  targetId: number,
): string {
  return `${sourceType}:${sourceId}->${targetType}:${targetId}`
}

export function inferRelationKind(
  sourceType: RelationEntityType,
  targetType: RelationEntityType,
): RelationKind {
  if (sourceType === 'character' && targetType === 'character') return 'character'
  if (sourceType === 'country' && targetType === 'country') return 'nation'
  if (sourceType === 'event' && targetType === 'event') return 'event-event'
  if (sourceType === 'event' || targetType === 'event') {
    if (sourceType === 'character' || targetType === 'character') return 'event-character'
    return 'event-country'
  }
  return 'membership'
}

function normalizeEndpoints(
  sourceType: RelationEntityType,
  sourceId: number,
  targetType: RelationEntityType,
  targetId: number,
  kind: RelationKind,
): {
  sourceType: RelationEntityType
  sourceId: number
  targetType: RelationEntityType
  targetId: number
} {
  let nextSourceType = sourceType
  let nextTargetType = targetType
  let nextSourceId = sourceId
  let nextTargetId = targetId

  // 事件边统一为 event → character/country；角色归属统一为 character → country。
  if (kind === 'event-character' || kind === 'event-country') {
    if (sourceType !== 'event') {
      nextSourceType = targetType
      nextTargetType = sourceType
      nextSourceId = targetId
      nextTargetId = sourceId
    }
  } else if (kind === 'membership') {
    if (sourceType !== 'character') {
      nextSourceType = targetType
      nextTargetType = sourceType
      nextSourceId = targetId
      nextTargetId = sourceId
    }
  } else if (kind === 'nation' || kind === 'character' || kind === 'event-event') {
    if (nextSourceId > nextTargetId) {
      const swapId = nextSourceId
      nextSourceId = nextTargetId
      nextTargetId = swapId
    }
  }

  return {
    sourceType: nextSourceType,
    sourceId: nextSourceId,
    targetType: nextTargetType,
    targetId: nextTargetId,
  }
}

async function readEntities(): Promise<{
  characters: Character[]
  countries: Country[]
  events: Event[]
}> {
  const [charactersRaw, countriesRaw, eventsRaw] = await Promise.all([
    db.characters.toArray(),
    db.countries.toArray(),
    db.events.toArray(),
  ])
  return {
    characters: charactersRaw.filter((item) => !item.deleted),
    countries: countriesRaw.filter((item) => !item.deleted),
    events: eventsRaw.filter((item) => !item.deleted),
  }
}

function collectProjectedRelations(
  characters: Character[],
  countries: Country[],
  events: Event[],
): Map<string, RelationRecord> {
  const now = Date.now()
  const characterIds = new Set(characters.map((item) => item.id).filter((id): id is number => id !== undefined))
  const countryIds = new Set(countries.map((item) => item.id).filter((id): id is number => id !== undefined))
  const rows = new Map<string, RelationRecord>()

  const add = (
    sourceType: RelationEntityType,
    sourceId: number | undefined,
    targetType: RelationEntityType,
    targetId: number | undefined,
    kind: RelationKind,
    label: string,
    existingId?: string,
  ): void => {
    if (
      sourceId === undefined ||
      targetId === undefined ||
      (sourceType === targetType && sourceId === targetId)
    ) {
      return
    }
    const normalized = normalizeEndpoints(sourceType, sourceId, targetType, targetId, kind)
    const id =
      existingId ??
      relationId(sourceType, normalized.sourceId, targetType, normalized.targetId)
    if (rows.has(id)) return
    rows.set(id, {
      id,
      sourceType,
      sourceId: normalized.sourceId,
      targetType,
      targetId: normalized.targetId,
      kind,
      label: label.trim() || DEFAULT_LABELS[kind],
      directed: kind !== 'nation' && kind !== 'character',
      createdAt: now,
      updatedAt: now,
      deleted: false,
    })
  }

  for (const character of characters) {
    if (character.id === undefined) continue
    for (const related of character.relatedCharacters ?? []) {
      if (related.characterId && characterIds.has(related.characterId)) {
        add(
          'character',
          character.id,
          'character',
          related.characterId,
          'character',
          related.relation,
          related.relationId,
        )
      }
    }
    if (character.countryId && countryIds.has(character.countryId)) {
      add(
        'character',
        character.id,
        'country',
        character.countryId,
        'membership',
        character.relatedNationLabels?.[character.countryId] ?? DEFAULT_LABELS.membership,
      )
    }
    for (const nationId of character.relatedNations ?? []) {
      if (countryIds.has(nationId)) {
        add(
          'character',
          character.id,
          'country',
          nationId,
          'membership',
          character.relatedNationLabels?.[nationId] ?? DEFAULT_LABELS.membership,
        )
      }
    }
    for (const eventId of character.relatedEvents ?? []) {
      if (events.some((event) => event.id === eventId)) {
        add(
          'event',
          eventId,
          'character',
          character.id,
          'event-character',
          character.relatedEventLabels?.[eventId] ?? DEFAULT_LABELS['event-character'],
        )
      }
    }
  }

  for (const country of countries) {
    if (country.id === undefined) continue
    for (const nationId of country.relatedNations ?? []) {
      if (countryIds.has(nationId)) {
        add(
          'country',
          country.id,
          'country',
          nationId,
          'nation',
          country.relatedNationLabels?.[nationId] ?? DEFAULT_LABELS.nation,
        )
      }
    }
    for (const characterId of country.characters ?? []) {
      if (characterIds.has(characterId)) {
        add('character', characterId, 'country', country.id, 'membership', DEFAULT_LABELS.membership)
      }
    }
    for (const eventId of country.relatedEvents ?? []) {
      if (events.some((event) => event.id === eventId)) {
        add(
          'event',
          eventId,
          'country',
          country.id,
          'event-country',
          country.relatedEventLabels?.[eventId] ?? DEFAULT_LABELS['event-country'],
        )
      }
    }
    for (const eventId of country.events ?? []) {
      if (events.some((event) => event.id === eventId)) {
        add(
          'event',
          eventId,
          'country',
          country.id,
          'event-country',
          country.relatedEventLabels?.[eventId] ?? DEFAULT_LABELS['event-country'],
        )
      }
    }
  }

  for (const event of events) {
    if (event.id === undefined) continue
    for (const related of event.relations ?? []) {
      if (events.some((item) => item.id === related.targetId)) {
        add(
          'event',
          event.id,
          'event',
          related.targetId,
          'event-event',
          related.relation,
        )
      }
    }
    for (const characterId of event.characters ?? []) {
      if (characterIds.has(characterId)) {
        add('event', event.id, 'character', characterId, 'event-character', DEFAULT_LABELS['event-character'])
      }
    }
    for (const countryId of event.countries ?? []) {
      if (countryIds.has(countryId)) {
        add('event', event.id, 'country', countryId, 'event-country', DEFAULT_LABELS['event-country'])
      }
    }
  }

  return rows
}

function relationIsOneSided(
  relation: RelationRecord,
  characterById: Map<number, Character>,
  countryById: Map<number, Country>,
  eventById: Map<number, Event>,
): boolean {
  if (relation.kind === 'character') {
    const source = characterById.get(relation.sourceId)
    const target = characterById.get(relation.targetId)
    if (!source || !target) return false
    const sourceLink = (source.relatedCharacters ?? []).find(
      (item) => item.characterId === target.id,
    )
    const targetLink = (target.relatedCharacters ?? []).find(
      (item) => item.characterId === source.id,
    )
    return (
      !sourceLink ||
      !targetLink ||
      sourceLink.relation !== relation.label ||
      targetLink.relation !== relation.label
    )
  }

  if (relation.kind === 'membership') {
    const character = characterById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (!character || !country) return false
    return (
      !(character.relatedNations ?? []).includes(country.id!) ||
      !(country.characters ?? []).includes(character.id!) ||
      character.relatedNationLabels?.[country.id!] !== relation.label
    )
  }

  if (relation.kind === 'event-character') {
    const event = eventById.get(relation.sourceId)
    const character = characterById.get(relation.targetId)
    if (!event || !character) return false
    return (
      !(event.characters ?? []).includes(character.id!) ||
      !(character.relatedEvents ?? []).includes(event.id!) ||
      character.relatedEventLabels?.[event.id!] !== relation.label
    )
  }

  if (relation.kind === 'event-country') {
    const event = eventById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (!event || !country) return false
    return (
      !(event.countries ?? []).includes(country.id!) ||
      !(country.relatedEvents ?? []).includes(event.id!) ||
      country.relatedEventLabels?.[event.id!] !== relation.label
    )
  }

  if (relation.kind === 'nation') {
    const source = countryById.get(relation.sourceId)
    const target = countryById.get(relation.targetId)
    if (!source || !target) return false
    return (
      !(source.relatedNations ?? []).includes(target.id!) ||
      !(target.relatedNations ?? []).includes(source.id!) ||
      source.relatedNationLabels?.[target.id!] !== relation.label ||
      target.relatedNationLabels?.[source.id!] !== relation.label
    )
  }

  if (relation.kind === 'event-event') {
    const source = eventById.get(relation.sourceId)
    const target = eventById.get(relation.targetId)
    if (!source || !target) return false
    const sourceLink = (source.relations ?? []).find((item) => item.targetId === target.id)
    const targetLink = (target.relations ?? []).find((item) => item.targetId === source.id)
    return (
      !sourceLink ||
      !targetLink ||
      sourceLink.relation !== relation.label ||
      targetLink.relation !== relation.label
    )
  }

  return false
}

/**
 * 将旧实体数组中的关系投影合并进 relations 表。
 * 数组仍然可以在旧面板中编辑；这里把它们作为输入，写回唯一真相源。
 */
export async function syncRelationsFromEntities(): Promise<RelationRecord[]> {
  const entities = await readEntities()
  const projected = collectProjectedRelations(entities.characters, entities.countries, entities.events)
  const existing = new Map((await db.relations.toArray()).map((relation) => [relation.id, relation]))
  const now = Date.now()
  const changes: RelationRecord[] = []

  const characterById = new Map(entities.characters.map((item) => [item.id!, item]))
  const countryById = new Map(entities.countries.map((item) => [item.id!, item]))
  const eventById = new Map(entities.events.map((item) => [item.id!, item]))
  let repaired = false
  for (const relation of projected.values()) {
    if (!relationIsOneSided(relation, characterById, countryById, eventById)) continue
    repaired = true
    const canonical = existing.get(relation.id)
    await applyProjectionAdd({
      ...relation,
      label: canonical && !canonical.deleted ? canonical.label : relation.label,
    })
  }
  if (repaired && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }

  for (const relation of projected.values()) {
    const current = existing.get(relation.id)
    if (!current) {
      changes.push(relation)
      continue
    }
    // Canonical relation is the shared label authority. Panel edits update it
    // through syncRelationLabelFromEntity; graph edits update it directly.
    const nextLabel =
      current && !current.deleted
        ? current.label
        : relation.label || current.label
    if (
      current.deleted ||
      current.label !== nextLabel ||
      current.kind !== relation.kind ||
      current.directed !== relation.directed
    ) {
      changes.push({
        ...current,
        label: nextLabel,
        kind: relation.kind,
        directed: relation.directed,
        deleted: false,
        updatedAt: now,
      })
    }
  }

  // 已从面板移除的旧关系同步软删除；custom 边不在此清理，避免误删图编辑创建的关系。
  // 新创建的边可能比数组投影晚 1-2 帧落库，给 3 秒宽限，避免“刚连线就被同步删掉”。
  for (const current of existing.values()) {
    if (projected.has(current.id) || current.deleted) continue
    if (!MANAGED_KINDS.includes(current.kind)) continue
    if (now - current.updatedAt < 3000) continue
    changes.push({ ...current, deleted: true, updatedAt: now })
  }

  if (changes.length > 0) {
    await db.relations.bulkPut(changes)
  }

  return [...projected.values()]
}

function uniquePush<T>(values: T[] | undefined, value: T): T[] {
  const list = values ? [...values] : []
  if (!list.includes(value)) list.push(value)
  return list
}

function uniqueRemove<T>(values: T[] | undefined, value: T): T[] {
  return (values ?? []).filter((item) => item !== value)
}

function withoutKey(record: Record<number, string> | undefined, key: number): Record<number, string> {
  const next = { ...(record ?? {}) }
  delete next[key]
  return next
}

async function applyProjectionAdd(relation: RelationRecord): Promise<void> {
  const { characters, countries, events } = await readEntities()
  const characterById = new Map(characters.map((item) => [item.id, item]))
  const countryById = new Map(countries.map((item) => [item.id, item]))
  const eventById = new Map(events.map((item) => [item.id, item]))
  const now = Date.now()

  if (relation.kind === 'character') {
    const source = characterById.get(relation.sourceId)
    const target = characterById.get(relation.targetId)
    if (source?.id !== undefined && target?.id !== undefined) {
      const sourceRelations = (source.relatedCharacters ?? []).filter((item) =>
        item.relationId
          ? item.relationId !== relation.id
          : item.characterId !== target.id,
      )
      sourceRelations.push({
        relationId: relation.id,
        characterId: target.id,
        name: target.name,
        relation: relation.label,
      })
      const targetRelations = (target.relatedCharacters ?? []).filter((item) =>
        item.relationId
          ? item.relationId !== relation.id
          : item.characterId !== source.id,
      )
      targetRelations.push({
        relationId: relation.id,
        characterId: source.id,
        name: source.name,
        relation: relation.label,
      })
      await Promise.all([
        db.characters.update(source.id, {
          relatedCharacters: sourceRelations,
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.characters.update(target.id, {
          relatedCharacters: targetRelations,
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (relation.kind === 'membership') {
    const character = characterById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (character?.id !== undefined && country?.id !== undefined) {
      await Promise.all([
        db.characters.update(character.id, {
          countryId: country.id,
          relatedNations: uniquePush(character.relatedNations, country.id),
          relatedNationLabels: {
            ...(character.relatedNationLabels ?? {}),
            [country.id]: relation.label,
          },
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.countries.update(country.id, {
          characters: uniquePush(country.characters, character.id),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (relation.kind === 'event-character') {
    const event = eventById.get(relation.sourceId)
    const character = characterById.get(relation.targetId)
    if (event?.id !== undefined && character?.id !== undefined) {
      await Promise.all([
        db.events.update(event.id, {
          characters: uniquePush(event.characters, character.id),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.characters.update(character.id, {
          relatedEvents: uniquePush(character.relatedEvents, event.id),
          relatedEventLabels: {
            ...(character.relatedEventLabels ?? {}),
            [event.id]: relation.label,
          },
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (
    relation.kind === 'event-event' ||
    (relation.sourceType === 'event' && relation.targetType === 'event')
  ) {
    const source = eventById.get(relation.sourceId)
    const target = eventById.get(relation.targetId)
    const upsert = (
      list: Event['relations'],
      targetId: number,
      label: string,
    ): Event['relations'] => [
      ...(list ?? []).filter((item) => item.targetId !== targetId),
      { targetId, relation: label },
    ]
    if (source?.id !== undefined && target?.id !== undefined) {
      await Promise.all([
        db.events.update(source.id, {
          relations: upsert(source.relations, target.id, relation.label),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.events.update(target.id, {
          relations: upsert(target.relations, source.id, relation.label),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (relation.kind === 'event-country') {
    const event = eventById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (event?.id !== undefined && country?.id !== undefined) {
      await Promise.all([
        db.events.update(event.id, {
          countries: uniquePush(event.countries, country.id),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.countries.update(country.id, {
          relatedEvents: uniquePush(country.relatedEvents, event.id),
          relatedEventLabels: {
            ...(country.relatedEventLabels ?? {}),
            [event.id]: relation.label,
          },
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (relation.kind === 'nation') {
    const source = countryById.get(relation.sourceId)
    const target = countryById.get(relation.targetId)
    if (source?.id !== undefined && target?.id !== undefined) {
      await Promise.all([
        db.countries.update(source.id, {
          relatedNations: uniquePush(source.relatedNations, target.id),
          relatedNationLabels: {
            ...(source.relatedNationLabels ?? {}),
            [target.id]: relation.label,
          },
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.countries.update(target.id, {
          relatedNations: uniquePush(target.relatedNations, source.id),
          relatedNationLabels: {
            ...(target.relatedNationLabels ?? {}),
            [source.id]: relation.label,
          },
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  }
}

async function applyProjectionRemove(relation: RelationRecord): Promise<void> {
  const { characters, countries, events } = await readEntities()
  const characterById = new Map(characters.map((item) => [item.id, item]))
  const countryById = new Map(countries.map((item) => [item.id, item]))
  const eventById = new Map(events.map((item) => [item.id, item]))
  const now = Date.now()

  if (relation.kind === 'character') {
    const source = characterById.get(relation.sourceId)
    const target = characterById.get(relation.targetId)
    if (source?.id !== undefined && target?.id !== undefined) {
      await Promise.all([
        db.characters.update(source.id, {
          relatedCharacters: (source.relatedCharacters ?? []).filter((item) =>
            item.relationId
              ? item.relationId !== relation.id
              : item.characterId !== target.id,
          ),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
        db.characters.update(target.id, {
          relatedCharacters: (target.relatedCharacters ?? []).filter((item) =>
            item.relationId
              ? item.relationId !== relation.id
              : item.characterId !== source.id,
          ),
          updatedAt: now,
          _syncStatus: 'pending',
        }),
      ])
    }
  } else if (relation.kind === 'membership') {
    const character = characterById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (character?.id !== undefined) {
      await db.characters.update(character.id, {
        countryId: character.countryId === country?.id ? undefined : character.countryId,
        relatedNations: uniqueRemove(character.relatedNations, country?.id ?? -1),
        relatedNationLabels: withoutKey(character.relatedNationLabels, country?.id ?? -1),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
    if (country?.id !== undefined) {
      await db.countries.update(country.id, {
        characters: uniqueRemove(country.characters, relation.sourceId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
  } else if (relation.kind === 'event-character') {
    const event = eventById.get(relation.sourceId)
    const character = characterById.get(relation.targetId)
    if (event?.id !== undefined) {
      await db.events.update(event.id, {
        characters: uniqueRemove(event.characters, relation.targetId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
    if (character?.id !== undefined) {
      await db.characters.update(character.id, {
        relatedEvents: uniqueRemove(character.relatedEvents, relation.sourceId),
        relatedEventLabels: withoutKey(character.relatedEventLabels, relation.sourceId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
  } else if (
    relation.kind === 'event-event' ||
    (relation.sourceType === 'event' && relation.targetType === 'event')
  ) {
    const source = eventById.get(relation.sourceId)
    const target = eventById.get(relation.targetId)
    const remove = (list: Event['relations'], targetId: number): Event['relations'] =>
      (list ?? []).filter((item) => item.targetId !== targetId)
    if (source?.id !== undefined) {
      await db.events.update(source.id, {
        relations: remove(source.relations, relation.targetId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
    if (target?.id !== undefined) {
      await db.events.update(target.id, {
        relations: remove(target.relations, relation.sourceId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
  } else if (relation.kind === 'event-country') {
    const event = eventById.get(relation.sourceId)
    const country = countryById.get(relation.targetId)
    if (event?.id !== undefined) {
      await db.events.update(event.id, {
        countries: uniqueRemove(event.countries, relation.targetId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
    if (country?.id !== undefined) {
      await db.countries.update(country.id, {
        relatedEvents: uniqueRemove(country.relatedEvents, relation.sourceId),
        relatedEventLabels: withoutKey(country.relatedEventLabels, relation.sourceId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
  } else if (relation.kind === 'nation') {
    const source = countryById.get(relation.sourceId)
    const target = countryById.get(relation.targetId)
    if (source?.id !== undefined) {
      await db.countries.update(source.id, {
        relatedNations: uniqueRemove(source.relatedNations, relation.targetId),
        relatedNationLabels: withoutKey(source.relatedNationLabels, relation.targetId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
    if (target?.id !== undefined) {
      await db.countries.update(target.id, {
        relatedNations: uniqueRemove(target.relatedNations, relation.sourceId),
        relatedNationLabels: withoutKey(target.relatedNationLabels, relation.sourceId),
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }
  }
}

function notifyRelationsChanged(): void {
  window.dispatchEvent(new Event('oc-relations-changed'))
  window.dispatchEvent(new Event('data-updated'))
}

/**
 * When a legacy entity panel changes a relation label, keep the canonical
 * relation table in step. The entity projection is already written by the
 * caller; this only updates the shared label used by the graph.
 */
export async function syncRelationLabelFromEntity(
  kind: RelationKind,
  sourceType: RelationEntityType,
  sourceId: number,
  targetType: RelationEntityType,
  targetId: number,
  label: string,
  explicitId?: string,
): Promise<void> {
  if (sourceType === targetType && sourceId === targetId) return
  const normalized = normalizeEndpoints(sourceType, sourceId, targetType, targetId, kind)
  const id =
    explicitId ??
    relationId(
      normalized.sourceType,
      normalized.sourceId,
      normalized.targetType,
      normalized.targetId,
    )
  const current = await db.relations.get(id)
  if (!current || current.deleted) return
  const nextLabel = label.trim() || DEFAULT_LABELS[kind]
  if (current.label === nextLabel) return
  await db.relations.update(id, { label: nextLabel, updatedAt: Date.now() })
}

export async function updateRelationLabel(id: string, label: string): Promise<void> {
  const relation = await db.relations.get(id)
  if (!relation) return
  const nextLabel = label.trim() || DEFAULT_LABELS[relation.kind]
  await db.relations.update(id, { label: nextLabel, updatedAt: Date.now(), deleted: false })
  await applyProjectionAdd({ ...relation, label: nextLabel })
  notifyRelationsChanged()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }
}

/** 更新关系线颜色/箭头，标签与连线共用同一个颜色。 */
export async function updateRelationStyle(
  id: string,
  patch: { color?: string; arrow?: RelationArrow },
): Promise<void> {
  const relation = await db.relations.get(id)
  if (!relation) return
  const updates: Partial<RelationRecord> = { updatedAt: Date.now() }
  if (patch.color !== undefined) updates.color = patch.color
  if (patch.arrow !== undefined) updates.arrow = patch.arrow
  await db.relations.update(id, updates)
  notifyRelationsChanged()
}

export async function deleteRelation(id: string): Promise<void> {
  const relation = await db.relations.get(id)
  if (!relation) return
  await db.relations.update(id, { deleted: true, updatedAt: Date.now() })
  await applyProjectionRemove(relation)
  notifyRelationsChanged()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }
}

export async function createRelation(input: {
  sourceType: RelationEntityType
  sourceId: number
  targetType: RelationEntityType
  targetId: number
  kind?: RelationKind
  label?: string
  /** 角色之间允许同一对节点存在多条关系；其他类型仍保持一对一。 */
  allowDuplicate?: boolean
}): Promise<RelationRecord | null> {
  if (input.sourceType === input.targetType && input.sourceId === input.targetId) return null
  const kind = input.kind ?? inferRelationKind(input.sourceType, input.targetType)
  const normalized = normalizeEndpoints(
    input.sourceType,
    input.sourceId,
    input.targetType,
    input.targetId,
    kind,
  )
  const now = Date.now()
  const baseId = relationId(
    normalized.sourceType,
    normalized.sourceId,
    normalized.targetType,
    normalized.targetId,
  )
  const existing = await db.relations.get(baseId)
  let id = baseId
  if (existing && !existing.deleted) {
    const canDuplicate =
      Boolean(input.allowDuplicate) && kind === 'character' &&
      normalized.sourceType === 'character' && normalized.targetType === 'character'
    if (!canDuplicate) return existing
    id = `${baseId}#${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  }
  const record: RelationRecord = {
    id,
    sourceType: normalized.sourceType,
    sourceId: normalized.sourceId,
    targetType: normalized.targetType,
    targetId: normalized.targetId,
    kind,
    label: input.label?.trim() || DEFAULT_LABELS[kind],
    directed: kind !== 'nation' && kind !== 'character',
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  await db.relations.put(record)
  await applyProjectionAdd(record)
  notifyRelationsChanged()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }
  return record
}

export async function buildGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  // 只读：liveQuery 内不能写 Dexie。实体数组与 canonical relations 在内存中合并，
  // 使面板编辑立即可见；持久化由 useGraphData 在写事务外调用 syncRelationsFromEntities。
  const [charactersRaw, eventsRaw, countriesRaw, relationsRaw] = await Promise.all([
    db.characters.toArray(),
    db.events.toArray(),
    db.countries.toArray(),
    db.relations.toArray(),
  ])
  const characters = charactersRaw.filter((item) => !item.deleted)
  const events = eventsRaw.filter((item) => !item.deleted)
  const countries = countriesRaw.filter((item) => !item.deleted)
  const relations = relationsRaw.filter((item) => !item.deleted)
  const projected = collectProjectedRelations(characters, countries, events)
  const mergedRelations = new Map(projected)
  for (const relation of relations) {
    const current = mergedRelations.get(relation.id)
    // 有投影时以实体数组/标签映射为准；样式（颜色/箭头）始终以 canonical 为准。
    if (!current) mergedRelations.set(relation.id, relation)
    else {
      mergedRelations.set(relation.id, {
        ...current,
        directed: relation.directed,
        color: relation.color,
        arrow: relation.arrow,
      })
    }
  }
  const edgesSource = [...mergedRelations.values()]

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()

  function addNode(
    id: string,
    label: string,
    type: RelationEntityType,
    entityId: number,
    subtitle?: string,
  ): void {
    if (nodeIds.has(id)) return
    nodeIds.add(id)
    nodes.push({
      id,
      type: `${type}Node`,
      position: { x: 0, y: 0 },
      data: { id, label, entityType: type, entityId, subtitle },
    })
  }

  for (const character of characters) {
    if (character.id === undefined) continue
    const id = `character-${character.id}`
    addNode(id, character.name, 'character', character.id, character.aliases?.join('、') || undefined)
    const node = nodes.find((item) => item.id === id)
    if (node) {
      const data = node.data as Record<string, unknown>
      data.avatarUrl = character.avatarUrl
      data.qAvatarUrl = character.qAvatarUrl ?? ''
      data.accentColor = character.accentColor ?? ''
      data.entityKind = character.entityKind ?? 'character'
    }
  }
  for (const event of events) {
    if (event.id === undefined) continue
    const id = `event-${event.id}`
    addNode(id, event.title, 'event', event.id, event.time)
    const node = nodes.find((item) => item.id === id)
    if (node) {
      const data = node.data as Record<string, unknown>
      data.imageUrl = event.headerUrl || event.images?.[0]?.url || ''
    }
  }
  for (const country of countries) {
    if (country.id === undefined) continue
    const id = `country-${country.id}`
    addNode(id, country.name, 'country', country.id)
    const node = nodes.find((item) => item.id === id)
    if (node) {
      const data = node.data as Record<string, unknown>
      data.flagUrl = country.flagUrl ?? ''
      data.accentColor = country.accentColor ?? ''
    }
  }

  for (const relation of edgesSource) {
    const source = `${relation.sourceType}-${relation.sourceId}`
    const target = `${relation.targetType}-${relation.targetId}`
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue
    edges.push({
      id: relation.id,
      source,
      target,
      type: 'relationEdge',
      data: {
        relation: relation.label,
        relationId: relation.id,
        kind: relation.kind,
        directed: relation.directed,
        color: relation.color,
        arrow: relation.arrow,
      },
    })
  }

  return { nodes, edges }
}
