import { worldBodyOf } from '@/lib/world-body'
import { plainTextOf } from '@/lib/export/site'
import type { Character, Country, Event, Tag, WorldEntry } from '@/types'
import {
  CapabilityError,
  READ_PERMISSION,
  type Caller,
  type CapabilityStore,
  type CodexEntry,
  type CodexEvent,
  type CodexField,
  type CodexRelation,
  type EntityKind,
  type EntityRecordMap,
  type EntitySummary,
} from './types'

const KIND_LABEL: Record<EntityKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

const ALL_KINDS: EntityKind[] = ['character', 'event', 'country', 'world']

function isActor(value: unknown): boolean {
  return value === 'human' || (typeof value === 'string' && (value.startsWith('agent:') || value.startsWith('plugin:')))
}

/** 所有能力入口都先过这里；权限不够 / 调用方不合法一律抛，不做「默认放行」 */
function requireRead(caller: Caller): void {
  if (!caller || !isActor(caller.actor) || typeof caller.permissions !== 'number') {
    throw new CapabilityError('invalid-caller', '调用方必须带 actor 与 permissions')
  }
  if (caller.permissions < READ_PERMISSION) {
    throw new CapabilityError('forbidden', '当前权限不足（需要只读权限）')
  }
}

function titleOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry): string {
  if (kind === 'event') return (entity as Event).title.trim()
  if (kind === 'world') return (entity as WorldEntry).title.trim()
  return (entity as Character | Country).name.trim()
}

function aliasesOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry): string[] {
  if (kind === 'character' || kind === 'country') return ((entity as Character | Country).aliases ?? []).filter(Boolean)
  if (kind === 'event') return ((entity as Event).aliases ?? []).filter(Boolean)
  return ((entity as WorldEntry).aliases ?? []).filter(Boolean)
}

function bodyOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry): string {
  if (kind === 'world') {
    const world = entity as WorldEntry
    return plainTextOf(worldBodyOf(world)).trim()
  }
  if (kind === 'event') {
    const event = entity as Event
    return (plainTextOf(event.document) || [event.summary, event.content].filter(Boolean).join('\n\n')).trim()
  }
  if (kind === 'country') {
    const country = entity as Country
    return (plainTextOf(country.document) || [country.description, country.system, country.geography, country.culture].filter(Boolean).join('\n\n')).trim()
  }
  const character = entity as Character
  return (plainTextOf(character.document) || [character.bio, character.lifeStory].filter(Boolean).join('\n\n')).trim()
}

interface Context {
  characters: Character[]
  events: Event[]
  countries: Country[]
  worldEntries: WorldEntry[]
  tags: Tag[]
  tagsById: Map<number, Tag>
  charactersById: Map<number, Character>
  countriesById: Map<number, Country>
  eventsById: Map<number, Event>
  worldById: Map<number, WorldEntry>
}

function contextOf(
  characters: Character[],
  events: Event[],
  countries: Country[],
  worldEntries: WorldEntry[],
  tags: Tag[],
): Context {
  return {
    characters,
    events,
    countries,
    worldEntries,
    tags,
    tagsById: new Map(tags.map((tag) => [tag.id, tag])),
    charactersById: new Map(characters.map((character) => [character.id, character])),
    countriesById: new Map(countries.map((country) => [country.id, country])),
    eventsById: new Map(events.map((event) => [event.id, event])),
    worldById: new Map(worldEntries.map((entry) => [entry.id, entry])),
  }
}

function tagNamesOf(ids: number[] | undefined, context: Context): string[] {
  return (ids ?? [])
    .map((id) => context.tagsById.get(id)?.name)
    .filter((name): name is string => Boolean(name))
}

function fieldsOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry, context: Context): CodexField[] {
  const fields: CodexField[] = []
  const push = (key: string, value: string | undefined): void => {
    if (value && value.trim() !== '') fields.push({ key, value: value.trim() })
  }
  if (kind === 'character') {
    const character = entity as Character
    push('种族', character.race)
    push('元素', character.element)
    push('职业', character.occupation)
    push('阵营', character.faction)
    push('国家', character.countryId ? context.countriesById.get(character.countryId)?.name : character.nationalityLegacy)
    push('身高', character.height)
    push('生日', character.birthday)
  } else if (kind === 'event') {
    const event = entity as Event
    push('时间', [event.time, event.endTime].filter(Boolean).join(' ~ '))
    push('地点', event.location)
  } else if (kind === 'country') {
    const country = entity as Country
    push('体制', country.system)
    push('地理', country.geography)
    push('文化', country.culture)
  } else {
    const world = entity as WorldEntry
    push('上级', world.parentId !== null ? context.worldById.get(world.parentId)?.title : '')
  }
  return fields
}

function relationsOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry, context: Context): CodexRelation[] {
  const out: CodexRelation[] = []
  if (kind === 'character') {
    for (const relation of (entity as Character).relatedCharacters) {
      out.push({
        relation: relation.relation,
        targetKind: 'character',
        targetId: relation.characterId,
        name: relation.name,
      })
    }
  } else if (kind === 'event') {
    for (const relation of (entity as Event).relations ?? []) {
      const target = context.eventsById.get(relation.targetId)
      if (target) out.push({ relation: relation.relation, targetKind: 'event', targetId: target.id, name: target.title })
    }
  } else if (kind === 'country') {
    const country = entity as Country
    for (const character of context.characters.filter((item) => item.countryId === country.id)) {
      out.push({ relation: '人物', targetKind: 'character', targetId: character.id, name: character.name })
    }
  } else {
    for (const reference of (entity as WorldEntry).references) {
      const targetId = reference.targetId
      const name =
        reference.targetType === 'character'
          ? context.charactersById.get(targetId)?.name
          : reference.targetType === 'event'
            ? context.eventsById.get(targetId)?.title
            : reference.targetType === 'country'
              ? context.countriesById.get(targetId)?.name
              : context.worldById.get(targetId)?.title
      if (name) {
        out.push({
          relation: '引用',
          targetKind: reference.targetType as EntityKind,
          targetId,
          name,
        })
      }
    }
  }
  return out
}

function eventsOf(kind: EntityKind, entity: Character | Event | Country | WorldEntry, context: Context): CodexEvent[] {
  const list =
    kind === 'character'
      ? context.events.filter((event) => (event.characters ?? []).includes((entity as Character).id))
      : kind === 'country'
        ? context.events.filter((event) => (event.countries ?? []).includes((entity as Country).id))
        : []
  return list
    .map((event) => ({
      id: event.id,
      title: event.title,
      time: event.time,
      endTime: event.endTime,
    }))
    .sort((a, b) => a.time.localeCompare(b.time, undefined, { numeric: true }))
}

function entryOf(
  kind: EntityKind,
  entity: Character | Event | Country | WorldEntry,
  context: Context,
): CodexEntry {
  return {
    kind,
    id: entity.id,
    title: titleOf(kind, entity) || '未命名',
    aliases: aliasesOf(kind, entity),
    fields: fieldsOf(kind, entity, context),
    relations: relationsOf(kind, entity, context),
    events: eventsOf(kind, entity, context),
    tags: tagNamesOf(entity.tags, context),
    body: bodyOf(kind, entity),
  }
}

/** 能力层：只读四件事（列 / 取 / 搜 / 关系切片）+ markdown 装配。 */
export function createCapabilities(store: CapabilityStore) {
  const loadContext = async (): Promise<Context> => {
    const [characters, events, countries, worldEntries, tags] = await Promise.all([
      store.list('character'),
      store.list('event'),
      store.list('country'),
      store.list('world'),
      store.tags(),
    ])
    return contextOf(characters, events, countries, worldEntries, tags)
  }

  return {
    /** 工具 `list_entities`：按类型列实体（标题 / 别名 / 标签 / 更新时间） */
    async listEntities(caller: Caller, kind: EntityKind, limit = 50): Promise<EntitySummary[]> {
      requireRead(caller)
      const context = await loadContext()
      const rows =
        kind === 'character'
          ? context.characters
          : kind === 'event'
            ? context.events
            : kind === 'country'
              ? context.countries
              : context.worldEntries
      return rows
        .slice()
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, Math.max(1, Math.min(200, limit)))
        .map((entity) => ({
          kind,
          id: entity.id,
          title: titleOf(kind, entity) || '未命名',
          aliases: aliasesOf(kind, entity),
          tags: tagNamesOf(entity.tags, context),
          updatedAt: entity.updatedAt ?? 0,
        }))
    },

    /** 工具 `get_entity`：字段 + 关系 + 相关事件 + 标签 + 正文纯文本 */
    async getEntity(caller: Caller, kind: EntityKind, id: number): Promise<CodexEntry> {
      requireRead(caller)
      const entity = await store.get(kind, id)
      if (!entity) throw new CapabilityError('not-found', `找不到${KIND_LABEL[kind]} #${id}`)
      const context = await loadContext()
      return entryOf(kind, entity, context)
    },

    /** 工具 `search`：v1 只搜标题 / 别名 / 标签名，不扫正文（避免每次全库读正文） */
    async search(caller: Caller, query: string, limit = 20): Promise<EntitySummary[]> {
      requireRead(caller)
      const needle = query.trim().toLocaleLowerCase('zh-Hans')
      if (needle === '') return []
      const context = await loadContext()
      const out: EntitySummary[] = []
      for (const kind of ALL_KINDS) {
        const rows =
          kind === 'character'
            ? context.characters
            : kind === 'event'
              ? context.events
              : kind === 'country'
                ? context.countries
                : context.worldEntries
        for (const entity of rows) {
          const title = titleOf(kind, entity)
          const aliases = aliasesOf(kind, entity)
          const tags = tagNamesOf(entity.tags, context)
          const haystack = [title, ...aliases, ...tags].join('\n').toLocaleLowerCase('zh-Hans')
          if (!haystack.includes(needle)) continue
          out.push({
            kind,
            id: entity.id,
            title: title || '未命名',
            aliases,
            tags,
            updatedAt: entity.updatedAt ?? 0,
          })
        }
      }
      return out
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(1, Math.min(50, limit)))
    },

    /** 工具 `graph_slice`：以实体为中心，取 N 跳关系（只读） */
    async graphSlice(caller: Caller, kind: EntityKind, id: number, hops = 1): Promise<CodexEntry[]> {
      requireRead(caller)
      const depth = Math.max(1, Math.min(2, hops))
      const context = await loadContext()
      const getEntity = (nextKind: EntityKind, nextId: number): Character | Event | Country | WorldEntry | undefined => {
        if (nextKind === 'character') return context.charactersById.get(nextId)
        if (nextKind === 'event') return context.eventsById.get(nextId)
        if (nextKind === 'country') return context.countriesById.get(nextId)
        return context.worldById.get(nextId)
      }

      const center = getEntity(kind, id)
      if (!center) throw new CapabilityError('not-found', `找不到${KIND_LABEL[kind]} #${id}`)

      const seen = new Set<string>([`${kind}:${id}`])
      const queue: Array<{ kind: EntityKind; id: number; depth: number }> = [{ kind, id, depth: 0 }]
      const entries: CodexEntry[] = []
      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) break
        const entity = getEntity(current.kind, current.id)
        if (!entity) continue
        entries.push(entryOf(current.kind, entity, context))
        if (current.depth >= depth) continue
        // 相关事件也算一跳：讨论角色时「他经历过什么」比只连角色更有用
        for (const event of eventsOf(current.kind, entity, context)) {
          const key = `event:${event.id}`
          if (seen.has(key)) continue
          seen.add(key)
          queue.push({ kind: 'event', id: event.id, depth: current.depth + 1 })
        }
        for (const relation of relationsOf(current.kind, entity, context)) {
          if (relation.targetKind === undefined || relation.targetId === undefined) continue
          const key = `${relation.targetKind}:${relation.targetId}`
          if (seen.has(key)) continue
          seen.add(key)
          queue.push({ kind: relation.targetKind, id: relation.targetId, depth: current.depth + 1 })
        }
      }
      return entries
    },

    /** 工具 `codex_slice`：把一条 `CodexEntry` 装配成 markdown（A2 的落点） */
    buildCodexSlice(entry: CodexEntry): string {
      return buildCodexSlice(entry)
    },
  }
}

/** 纯装配：一条实体 → 一份给 agent 读的 markdown。 */
export function buildCodexSlice(entry: CodexEntry): string {
  const lines: string[] = [`# ${entry.title}（${KIND_LABEL[entry.kind]}）`]
  if (entry.aliases.length > 0) lines.push(`别名：${entry.aliases.join('、')}`)
  if (entry.fields.length > 0) lines.push(`字段：${entry.fields.map((field) => `${field.key} ${field.value}`).join(' · ')}`)
  if (entry.relations.length > 0) {
    lines.push(`关系：${entry.relations.map((relation) => `${relation.name}（${relation.relation}）`).join('、')}`)
  }
  if (entry.events.length > 0) {
    lines.push(
      `事件（按时间）：${entry.events
        .map((event) => `${event.time || '未定年'} ${event.title}`)
        .join(' → ')}`,
    )
  }
  if (entry.tags.length > 0) lines.push(`标签：${entry.tags.join('、')}`)
  if (entry.body.trim() !== '') {
    lines.push('', '正文：', '', entry.body.trim())
  }
  return lines.join('\n')
}
