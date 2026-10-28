import type {
  Character,
  Country,
  Event,
  Period,
  ProjectMeta,
  Tag,
  WorldEntry,
} from '@/types'
import { normalizeTagColor, pickTagColor } from '@/lib/tag-colors'
import {
  CHARACTER_KEYS,
  COUNTRY_KEYS,
  EVENT_KEYS,
  PERIOD_KEYS,
  WORLD_KEYS,
  readBool,
  readImageList,
  readNumber,
  readObjects,
  readPosition,
  readString,
  readStringList,
  readTimestamp,
  type KeyChain,
} from './fields'
import { classifyFolderWithOverrides, type FolderClassification } from './mapping'
import { noteAliases, noteTitle, toNote } from './note'
import { normalizeLinkKey, stripOrderPrefix } from './wikilink'
import { customFieldKeys } from './vault-field-keys'
import type {
  LinkResolution,
  LoadedEntity,
  VaultDataset,
  VaultEntityKind,
  VaultFileEntry,
  VaultFolderRule,
  VaultIndex,
  VaultNote,
  VaultScanReport,
  VaultScanResult,
  VaultStorableKind,
  VaultTarget,
} from './types'

// ── 扫描：文件集 → 数据集 + 索引 + 报告 ──────────────────────────────────
// 纯函数，不碰磁盘、不碰 Dexie。真正读盘由 Rust 命令负责，
// 因此这一层可以在 Node 里对真实 vault 离线跑（scripts/vault-analyze.ts）。
//
// 关于 id：vault 的磁盘格式里**不写 id**（引用一律用 [[文件名]] 或别名），
// id 是装载期的内部标识，按「同类实体按路径排序」确定性分配。
// 好处是永远不会污染用户手写的 frontmatter。

const SYNCED = 'synced'

/** 参与 id 分配的实体类型（tag 单独按名字排序分配） */
const STORABLE_KINDS: VaultStorableKind[] = [
  'character',
  'event',
  'country',
  'worldEntry',
  'period',
]

export interface ScanOptions {
  root: string
  files: VaultFileEntry[]
  skippedDirs?: string[]
  /** 目录 → 类型的用户覆盖 */
  overrides?: VaultFolderRule[]
  /** oc-studio.json 的原文（存在时用它承载项目元信息） */
  marker?: string | null
  /** marker 对应的相对路径，缺省 'oc-studio.json' */
  markerPath?: string
}

function syncStamp(mtimeMs: number): { _syncStatus: string; _lastModified: number } {
  return { _syncStatus: SYNCED, _lastModified: mtimeMs }
}

function baseNameOf(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1] ?? ''
}

/**
 * 自定义字段：按登记的键从 frontmatter 读回。
 * 键就是字段名本身（用户加的「境界」→ `境界:`），Obsidian 里直接可读可改。
 * 没登记的键不读 —— 于是「删掉字段」之后数据仍在文件里，加回来还能读到。
 */
function readCustomFields(
  fm: Record<string, unknown>,
  kind: 'character' | 'event' | 'worldEntry',
): Record<string, string> | undefined {
  const keys = customFieldKeys(kind)
  if (keys.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = readString(fm, { primary: key, alt: [] })
    if (value !== '') out[key] = value
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** 目标的「文件名解析键」 */
function targetBasenameKey(target: VaultTarget): string {
  return normalizeLinkKey(baseNameOf(target.relPath).replace(/\.md$/i, ''))
}

/** frontmatter 的 tags 字段 → 名字数组（键链由 fields.ts 提供，与写回保持同一张表） */
function tagNamesOf(note: VaultNote, chain: KeyChain): string[] {
  return readStringList(note.frontmatter, chain)
}

/** 按实体类型取它的 tags 键链 */
function tagsChainOf(kind: VaultEntityKind): KeyChain {
  switch (kind) {
    case 'character':
      return CHARACTER_KEYS.tags
    case 'country':
      return COUNTRY_KEYS.tags
    case 'event':
      return EVENT_KEYS.tags
    case 'worldEntry':
      return WORLD_KEYS.tags
    default:
      return { primary: 'tags', alt: [] }
  }
}

interface Slot {
  note: VaultNote
  cls: FolderClassification
}

export function scanVault(options: ScanOptions): VaultScanResult {
  const { root, files, skippedDirs = [], overrides = [], marker = null } = options
  const markerPath = options.markerPath ?? 'oc-studio.json'

  // ── 1. 逐文件解析 ────────────────────────────────────────────────
  const notes: VaultNote[] = []
  const emptyFiles: string[] = []
  const unparsedFrontmatter: { relPath: string; error: string }[] = []
  const keyCount = new Map<string, number>()

  for (const file of files) {
    if (file.content.trim() === '') {
      emptyFiles.push(file.relPath.replace(/\\/g, '/'))
      continue
    }
    const { note, error } = toNote(file)
    if (error !== null) unparsedFrontmatter.push({ relPath: note.relPath, error })
    for (const key of Object.keys(note.frontmatter)) {
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1)
    }
    notes.push(note)
  }

  // ── 2. 目录分类 ──────────────────────────────────────────────────
  const slots: Slot[] = notes.map((note) => ({
    note,
    cls: classifyFolderWithOverrides(note.folder, overrides),
  }))
  const mapped = slots.filter((slot) => slot.cls.kind !== 'ignore')
  const unmappedSlots = slots.filter((slot) => slot.cls.kind === 'ignore')

  // ── 3. 标签优先（tag 的 id 按名字排序分配，与文件顺序无关） ─────────
  const tagDefs = new Map<string, { display: string; relPath: string; color: string }>()

  for (const slot of mapped) {
    if (slot.cls.kind !== 'tag') continue
    const display = noteTitle(slot.note)
    const key = normalizeLinkKey(display)
    if (key === '' || tagDefs.has(key)) continue
    tagDefs.set(key, {
      display,
      relPath: slot.note.relPath,
      color: normalizeTagColor(slot.note.frontmatter.color, display),
    })
  }

  for (const slot of mapped) {
    if (slot.cls.kind === 'tag') continue
    for (const name of tagNamesOf(slot.note, tagsChainOf(slot.cls.kind))) {
      const key = normalizeLinkKey(name)
      if (key === '' || tagDefs.has(key)) continue
      tagDefs.set(key, { display: name, relPath: '', color: pickTagColor(name) })
    }
  }

  const sortedTagDefs = [...tagDefs.values()].sort((a, b) =>
    a.display.localeCompare(b.display, 'zh-Hans'),
  )
  const tagIdByName = new Map<string, number>()
  const tagRows: LoadedEntity<Tag>[] = sortedTagDefs.map((def, index) => {
    const id = index + 1
    tagIdByName.set(normalizeLinkKey(def.display), id)
    return {
      entity: { id, name: def.display, category: '', color: def.color },
      relPath: def.relPath,
      bodyMarkdown: '',
    }
  })

  const tagIdsOf = (note: VaultNote, chain: KeyChain): number[] => {
    const ids: number[] = []
    for (const name of tagNamesOf(note, chain)) {
      const id = tagIdByName.get(normalizeLinkKey(name))
      if (id !== undefined && !ids.includes(id)) ids.push(id)
    }
    return ids
  }

  // ── 4. 分配 id（同类按路径排序，确定性） ──────────────────────────
  const idByPath = new Map<string, number>()
  const grouped = new Map<VaultStorableKind, Slot[]>()
  for (const kind of STORABLE_KINDS) grouped.set(kind, [])

  for (const slot of mapped) {
    if (slot.cls.kind === 'tag') continue
    if (slot.cls.kind === 'ignore') continue
    grouped.get(slot.cls.kind)?.push(slot)
  }

  for (const [, list] of grouped) {
    list.sort((a, b) => a.note.relPath.localeCompare(b.note.relPath, 'zh-Hans'))
    list.forEach((slot, index) => idByPath.set(slot.note.relPath, index + 1))
  }

  // ── 5. 解析索引：解析键 → 目标 ────────────────────────────────────
  const entityTargets: VaultTarget[] = []
  for (const slot of mapped) {
    if (slot.cls.kind === 'tag') continue
    const id = idByPath.get(slot.note.relPath)
    if (id === undefined) continue
    entityTargets.push({
      kind: slot.cls.kind,
      relPath: slot.note.relPath,
      title: noteTitle(slot.note),
      id,
    })
  }

  const tagTargets: VaultTarget[] = tagRows
    .filter((row) => row.relPath !== '')
    .map((row) => ({
      kind: 'tag' as const,
      relPath: row.relPath,
      title: row.entity.name,
      id: row.entity.id,
    }))

  const allTargets = [...entityTargets, ...tagTargets]
  const byPath = new Map(allTargets.map((target) => [target.relPath, target]))

  const byKey = new Map<string, VaultTarget[]>()
  /** 键 → 声明了该键为别名的文件（用于报告别名冲突） */
  const aliasDeclaredBy = new Map<string, Set<string>>()

  const addKey = (key: string, target: VaultTarget): void => {
    if (key === '') return
    const list = byKey.get(key)
    if (list === undefined) {
      byKey.set(key, [target])
      return
    }
    if (!list.some((item) => item.relPath === target.relPath)) list.push(target)
  }

  for (const slot of mapped) {
    const target = byPath.get(slot.note.relPath)
    if (target === undefined) continue
    addKey(normalizeLinkKey(slot.note.basename), target)
    for (const alias of noteAliases(slot.note)) {
      const key = normalizeLinkKey(alias)
      addKey(key, target)
      const owners = aliasDeclaredBy.get(key) ?? new Set<string>()
      owners.add(slot.note.relPath)
      aliasDeclaredBy.set(key, owners)
    }
  }

  // 目录里的标签文件也要能被 [[标签名]] 指到
  for (const row of tagRows) {
    if (row.relPath === '') continue
    const target = byPath.get(row.relPath)
    if (target === undefined) continue
    addKey(normalizeLinkKey(row.entity.name), target)
    addKey(normalizeLinkKey(baseNameOf(row.relPath).replace(/\.md$/i, '')), target)
  }

  const duplicateKeys = [...byKey.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, paths: list.map((item) => item.relPath) }))
    .sort((a, b) => b.paths.length - a.paths.length)

  const lookupTarget = (name: string, kind: VaultEntityKind): VaultTarget | undefined => {
    if (name.trim() === '') return undefined
    const list = byKey.get(normalizeLinkKey(name))
    if (list === undefined) return undefined
    return list.find((item) => item.kind === kind) ?? list[0]
  }

  /**
   * 软引用解析：不限实体类型，优先取「文件名正好等于该名字」的那个。
   * 用于 `阵营` 这类自由文本字段 —— 名字对得上就建立跳转，对不上就保持纯文本。
   */
  const lookupAny = (name: string): VaultTarget | undefined => {
    const key = normalizeLinkKey(name)
    if (key === '') return undefined
    const list = byKey.get(key)
    if (list === undefined) return undefined
    return list.find((item) => targetBasenameKey(item) === key) ?? list[0]
  }

  /** 阵营名 → 出现次数与来源（用于「哪些阵营还没有对应词条」的报告） */
  const factionRefs: { name: string; relPath: string }[] = []

  // ── 6. 构造实体 ──────────────────────────────────────────────────
  const characters: LoadedEntity<Character>[] = []
  const countries: LoadedEntity<Country>[] = []
  const events: LoadedEntity<Event>[] = []
  const worldEntries: LoadedEntity<WorldEntry>[] = []
  const periods: LoadedEntity<Period>[] = []

  // worldEntry 的 order：优先用文件名里的 `NN.` 序号，否则取所在目录内的顺序。
  // 注意不要写回 frontmatter —— 那份对象会在写盘时被原样合并回去。
  const orderByPath = new Map<string, number>()
  const folderCursor = new Map<string, number>()
  for (const slot of grouped.get('worldEntry') ?? []) {
    const cursor = folderCursor.get(slot.note.folder) ?? 0
    folderCursor.set(slot.note.folder, cursor + 1)
    orderByPath.set(slot.note.relPath, cursor)
  }

  for (const slot of grouped.get('character') ?? []) {
    const note = slot.note
    const fm = note.frontmatter
    const id = idByPath.get(note.relPath) ?? 0
    const countryName = readString(fm, CHARACTER_KEYS.country)
    const countryId = lookupTarget(countryName, 'country')?.id
    const factionName = readString(fm, CHARACTER_KEYS.faction)
    if (factionName !== '') factionRefs.push({ name: factionName, relPath: note.relPath })

    characters.push({
      entity: {
        id,
        name: noteTitle(note),
        aliases: noteAliases(note),
        race: readString(fm, CHARACTER_KEYS.race),
        element: readString(fm, CHARACTER_KEYS.element),
        occupation: readString(fm, CHARACTER_KEYS.occupation),
        faction: factionName,
        factionId: lookupAny(factionName)?.id,
        nationalityLegacy: countryName,
        countryId,
        height: readString(fm, CHARACTER_KEYS.height),
        birthday: readString(fm, CHARACTER_KEYS.birthday),
        avatarUrl: readString(fm, CHARACTER_KEYS.avatar),
        headerUrl: readString(fm, CHARACTER_KEYS.header) || undefined,
        bio: readString(fm, CHARACTER_KEYS.bio),
        lifeStory: readString(fm, CHARACTER_KEYS.lifeStory),
        relatedCharacters: readObjects(fm, CHARACTER_KEYS.relations).map((item) => {
          const name = typeof item.name === 'string' ? item.name : ''
          const relation = typeof item.relation === 'string' ? item.relation : ''
          return { characterId: lookupTarget(name, 'character')?.id, name, relation }
        }),
        gallery: readImageList(fm, CHARACTER_KEYS.gallery).map((item) => ({
          url: item.url,
          caption: item.caption,
        })),
        avatars: readImageList(fm, CHARACTER_KEYS.avatars).map((item) => ({
          url: item.url,
          type: 'portrait' as const,
        })),
        tags: tagIdsOf(note, CHARACTER_KEYS.tags),
        isMajor: readBool(fm, CHARACTER_KEYS.isMajor),
        order: readNumber(fm, CHARACTER_KEYS.order),
        graphPosition: readPosition(fm, CHARACTER_KEYS.graphPosition),
        custom: readCustomFields(fm, 'character'),
        createdAt: readTimestamp(fm, CHARACTER_KEYS.date, note.mtimeMs),
        updatedAt: note.mtimeMs,
        deleted: false,
        ...syncStamp(note.mtimeMs),
      },
      relPath: note.relPath,
      bodyMarkdown: note.body,
    })
  }

  for (const slot of grouped.get('country') ?? []) {
    const note = slot.note
    const fm = note.frontmatter
    const parentName = readString(fm, COUNTRY_KEYS.parent)
    countries.push({
      entity: {
        id: idByPath.get(note.relPath) ?? 0,
        name: noteTitle(note),
        aliases: noteAliases(note),
        parentId: lookupTarget(parentName, 'country')?.id ?? null,
        description: readString(fm, COUNTRY_KEYS.description),
        system: readString(fm, COUNTRY_KEYS.system),
        geography: readString(fm, COUNTRY_KEYS.geography),
        culture: readString(fm, COUNTRY_KEYS.culture),
        flagUrl: readString(fm, COUNTRY_KEYS.flag) || undefined,
        headerUrl: readString(fm, COUNTRY_KEYS.header) || undefined,
        characters: readStringList(fm, COUNTRY_KEYS.characters)
          .map((name) => lookupTarget(name, 'character')?.id)
          .filter((id): id is number => id !== undefined),
        events: readStringList(fm, COUNTRY_KEYS.events)
          .map((name) => lookupTarget(name, 'event')?.id)
          .filter((id): id is number => id !== undefined),
        tags: tagIdsOf(note, COUNTRY_KEYS.tags),
        order: readNumber(fm, COUNTRY_KEYS.order),
        graphPosition: readPosition(fm, COUNTRY_KEYS.graphPosition),
        createdAt: readTimestamp(fm, COUNTRY_KEYS.date, note.mtimeMs),
        updatedAt: note.mtimeMs,
        deleted: false,
        ...syncStamp(note.mtimeMs),
      },
      relPath: note.relPath,
      bodyMarkdown: note.body,
    })
  }

  for (const slot of grouped.get('event') ?? []) {
    const note = slot.note
    const fm = note.frontmatter
    const parentName = readString(fm, EVENT_KEYS.parent)
    events.push({
      entity: {
        id: idByPath.get(note.relPath) ?? 0,
        title: noteTitle(note),
        aliases: noteAliases(note),
        time: readString(fm, EVENT_KEYS.time),
        endTime: readString(fm, EVENT_KEYS.endTime) || undefined,
        location: readString(fm, EVENT_KEYS.location),
        summary: readString(fm, EVENT_KEYS.summary),
        content: '',
        characters: readStringList(fm, EVENT_KEYS.characters)
          .map((name) => lookupTarget(name, 'character')?.id)
          .filter((id): id is number => id !== undefined),
        countries: readStringList(fm, EVENT_KEYS.countries)
          .map((name) => lookupTarget(name, 'country')?.id)
          .filter((id): id is number => id !== undefined),
        headerUrl: readString(fm, EVENT_KEYS.header) || undefined,
        parentEventId: lookupTarget(parentName, 'event')?.id ?? null,
        relations: readObjects(fm, EVENT_KEYS.relations)
          .map((item) => ({
            targetId: lookupTarget(typeof item.name === 'string' ? item.name : '', 'event')?.id ?? 0,
            relation: typeof item.relation === 'string' ? item.relation : '',
          }))
          .filter((item) => item.targetId !== 0),
        tags: tagIdsOf(note, EVENT_KEYS.tags),
        images: readImageList(fm, EVENT_KEYS.images).map((item) => ({
          url: item.url,
          caption: item.caption,
        })),
        isMajor: readBool(fm, EVENT_KEYS.isMajor),
        order: readNumber(fm, EVENT_KEYS.order),
        graphPosition: readPosition(fm, EVENT_KEYS.graphPosition),
        custom: readCustomFields(fm, 'event'),
        createdAt: readTimestamp(fm, EVENT_KEYS.date, note.mtimeMs),
        updatedAt: note.mtimeMs,
        deleted: false,
        ...syncStamp(note.mtimeMs),
      },
      relPath: note.relPath,
      bodyMarkdown: note.body,
    })
  }

  for (const slot of grouped.get('worldEntry') ?? []) {
    const note = slot.note
    const fm = note.frontmatter
    const { order } = stripOrderPrefix(note.basename)
    const folderOrder = orderByPath.get(note.relPath) ?? 0
    const parentName = readString(fm, WORLD_KEYS.parent)
    worldEntries.push({
      entity: {
        id: idByPath.get(note.relPath) ?? 0,
        title: noteTitle(note),
        aliases: noteAliases(note),
        content: '',
        // `分类` 已废弃（层级只由 parentId 表达），界面不再编辑；
        // 但老笔记里已有的值仍然读回来 —— 迁移时不至于把它弄丢。
        category: readString(fm, WORLD_KEYS.category),
        parentId: lookupTarget(parentName, 'worldEntry')?.id ?? null,
        order: readNumber(fm, WORLD_KEYS.order) ?? order ?? folderOrder,
        isConcept: readBool(fm, WORLD_KEYS.isConcept),
        references: [],
        tags: tagIdsOf(note, WORLD_KEYS.tags),
        custom: readCustomFields(fm, 'worldEntry'),
        createdAt: readTimestamp(fm, WORLD_KEYS.date, note.mtimeMs),
        updatedAt: note.mtimeMs,
        deleted: false,
        ...syncStamp(note.mtimeMs),
      },
      relPath: note.relPath,
      bodyMarkdown: note.body,
    })
  }

  // 时期：`时期/xxx.md` 里只有四条属性，正文为空。以前这里是空的（时期只活在 Dexie 里，
  // 一旦切到文件夹就丢），迁移要「无损」就必须能读回来。
  for (const slot of grouped.get('period') ?? []) {
    const note = slot.note
    const fm = note.frontmatter
    periods.push({
      entity: {
        id: idByPath.get(note.relPath) ?? 0,
        name: noteTitle(note),
        startTime: readString(fm, PERIOD_KEYS.startTime),
        endTime: readString(fm, PERIOD_KEYS.endTime),
        color: readString(fm, PERIOD_KEYS.color),
        deleted: false,
        ...syncStamp(note.mtimeMs),
      },
      relPath: note.relPath,
      bodyMarkdown: note.body,
    })
  }

  // ── 7. 项目元信息 ────────────────────────────────────────────────
  const markerData = parseMarker(marker)
  const fallbackName = baseNameOf(root.replace(/[\\/]+$/, '')) || '未命名世界'
  const project: LoadedEntity<ProjectMeta> = {
    entity: {
      id: 1,
      worldName: markerData?.worldName ?? fallbackName,
      tagline: markerData?.tagline ?? '',
      coverUrl: markerData?.cover ?? '',
      updatedAt: Date.now(),
      _syncStatus: SYNCED,
      _lastModified: Date.now(),
    },
    relPath: marker === null ? '' : markerPath,
    bodyMarkdown: '',
  }

  // ── 8. 链接解析与报告 ────────────────────────────────────────────
  const occurrences = new Map<string, { display: string; count: number; sources: Set<string> }>()
  for (const note of notes) {
    for (const link of note.links) {
      if (link.embed) continue
      const key = normalizeLinkKey(link.target)
      if (key === '') continue
      const entry = occurrences.get(key) ?? { display: link.target.trim(), count: 0, sources: new Set<string>() }
      entry.count += 1
      entry.sources.add(note.relPath)
      occurrences.set(key, entry)
    }
  }

  const unresolved: LinkResolution[] = []
  const ambiguous: LinkResolution[] = []
  let totalLinks = 0
  let resolvedLinks = 0
  let aliasLinks = 0

  for (const [key, entry] of occurrences) {
    totalLinks += entry.count
    const candidates = byKey.get(key) ?? []
    const base: LinkResolution = {
      target: entry.display,
      count: entry.count,
      resolvedTo: null,
      via: 'none',
      ambiguous: candidates.map((item) => item.relPath),
      sources: [...entry.sources].slice(0, 8),
    }

    if (candidates.length === 0) {
      unresolved.push(base)
      continue
    }

    resolvedLinks += entry.count
    const first = candidates[0]
    const via: 'basename' | 'alias' = targetBasenameKey(first) === key ? 'basename' : 'alias'
    if (via === 'alias') aliasLinks += entry.count
    const resolution: LinkResolution = {
      ...base,
      via,
      resolvedTo: { kind: first.kind, relPath: first.relPath },
    }
    // 指向多个文件的链接不自动选边，进报告等人工裁决
    if (candidates.length > 1) ambiguous.push(resolution)
  }

  const aliasConflicts = [...aliasDeclaredBy.entries()]
    .filter(([key, owners]) => owners.size > 1 || (byKey.get(key)?.length ?? 0) > owners.size)
    .map(([key, owners]) => ({ alias: key, paths: [...owners] }))

  // 阵营软引用：名字对不上任何词条的，按名字聚合成「待创建」清单
  const factionAgg = new Map<string, { name: string; count: number; sources: Set<string> }>()
  for (const ref of factionRefs) {
    if (lookupAny(ref.name) !== undefined) continue
    const key = normalizeLinkKey(ref.name)
    const entry = factionAgg.get(key) ?? { name: ref.name, count: 0, sources: new Set<string>() }
    entry.count += 1
    entry.sources.add(ref.relPath)
    factionAgg.set(key, entry)
  }
  const unresolvedFactions = [...factionAgg.values()]
    .map((entry) => ({ name: entry.name, count: entry.count, sources: [...entry.sources].slice(0, 8) }))
    .sort((a, b) => b.count - a.count)

  const folderStats = new Map<string, { rule: string; kind: VaultEntityKind; count: number }>()
  for (const slot of mapped) {
    const folder = slot.note.folder === '' ? '(根目录)' : slot.note.folder
    const key = `${folder}\u0000${slot.cls.kind}`
    const entry = folderStats.get(key) ?? {
      rule: slot.cls.matched ?? '(未匹配)',
      kind: slot.cls.kind,
      count: 0,
    }
    entry.count += 1
    folderStats.set(key, entry)
  }

  const byKind = {} as Record<VaultEntityKind, number>
  for (const kind of [...STORABLE_KINDS, 'tag', 'ignore'] as VaultEntityKind[]) byKind[kind] = 0
  for (const slot of slots) byKind[slot.cls.kind] += 1

  const report: VaultScanReport = {
    root,
    noteCount: notes.length,
    skippedDirs: [...skippedDirs],
    byKind,
    folders: [...folderStats.entries()]
      .map(([key, value]) => ({ folder: key.split('\u0000')[0], ...value }))
      .sort((a, b) => b.count - a.count),
    links: {
      total: totalLinks,
      distinct: occurrences.size,
      resolved: resolvedLinks,
      viaAlias: aliasLinks,
      unresolved: unresolved.sort((a, b) => b.count - a.count),
      ambiguous: ambiguous.sort((a, b) => b.count - a.count),
    },
    aliases: {
      total: aliasDeclaredBy.size,
      usedByLinks: [...aliasDeclaredBy.keys()].filter((key) => occurrences.has(key)).length,
      conflicts: aliasConflicts,
    },
    unresolvedFactions,
    duplicateKeys,
    emptyFiles,
    unmapped: unmappedSlots.map((slot) => ({ relPath: slot.note.relPath, folder: slot.note.folder })),
    unparsedFrontmatter,
    // 正文层的解析错误由 markdown 桥在装载时补进来（见 markdown-bridge）
    unparsedBodies: [],
    frontmatterKeys: [...keyCount.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  }

  const dataset: VaultDataset = {
    characters,
    events,
    countries,
    worldEntries,
    tags: tagRows,
    periods,
    project,
    ignored: unmappedSlots.map((slot) => slot.note.relPath),
  }

  const index: VaultIndex = { byKey, byPath }

  return { dataset, report, index, notes }
}

interface MarkerData {
  worldName?: string
  tagline?: string
  cover?: string
}

function parseMarker(marker: string | null): MarkerData | null {
  if (marker === null) return null
  try {
    const parsed: unknown = JSON.parse(marker)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const project = (record.project ?? {}) as Record<string, unknown>
    return {
      worldName: str(project.worldName) ?? str(record.worldName),
      tagline: str(project.tagline) ?? str(record.tagline),
      cover: str(project.cover) ?? str(record.cover),
    }
  } catch {
    return null
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
