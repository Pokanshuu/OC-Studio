'use client'

import { useCallback, useEffect, useState } from 'react'
import { pickAccentColor, resolveAccentColor } from '@/lib/entity-accent'

export type CustomLinkField =
  | 'characterIds'
  | 'countryIds'
  | 'eventIds'
  | 'worldEntryIds'

export interface CustomLinkMeta {
  relation?: string
  role?: string
  position?: string
  contribution?: string
  attitude?: string
}

export interface CustomEntry {
  id: string
  name: string
  note: string
  headerUrl?: string
  avatarUrl?: string
  gallery: string[]
  characterIds: number[]
  countryIds: number[]
  eventIds: number[]
  worldEntryIds: number[]
  /** 其他自定义分类条目的 id。 */
  relatedEntryIds: string[]
  /** 人物 id -> 与条目的关系描述。 */
  characterLinks: Record<string, CustomLinkMeta>
  /** 国家 id -> 与条目的关系描述。 */
  countryLinks: Record<string, CustomLinkMeta>
  /** 事件 id -> 与条目的关系描述。 */
  eventLinks: Record<string, CustomLinkMeta>
  /** 其他自定义条目 id -> 关系描述。 */
  entryLinks: Record<string, CustomLinkMeta>
  /** 兼容旧数据。 */
  characterAttitudes?: Record<string, string>
  countryAttitudes?: Record<string, string>
}

export interface CustomScopedEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface CustomSection {
  id: string
  name: string
  accentColor?: string
  description: string
  /** 内置预设分类：武器 / 宠物。用户自建分类没有该字段。 */
  preset?: 'weapon' | 'pet'
  entries: CustomEntry[]
  /** 分类内部关系图专用的边，不写入主关系图。 */
  scopedEdges: CustomScopedEdge[]
  /** 分类节点直接连到人物/国家/事件/世界观。 */
  characterIds: number[]
  countryIds: number[]
  eventIds: number[]
  worldEntryIds: number[]
  relatedSectionIds: string[]
  /** 自定义关系边的标签；不填则使用默认“相关/包含”。 */
  edgeLabels: Record<string, string>
}

interface LegacyCustomSection extends Partial<CustomSection> {
  characterIds?: number[]
  countryIds?: number[]
  eventIds?: number[]
  worldEntryIds?: number[]
}

const STORAGE_KEY = 'oc-studio-custom-sections'
const CHANGE_EVENT = 'oc-custom-sections-changed'

function makeId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeEntry(name: string): CustomEntry {
  return {
    id: makeId('entry'),
    name: name.trim() || '新条目',
    note: '',
    headerUrl: '',
    avatarUrl: '',
    gallery: [],
    characterIds: [],
    countryIds: [],
    eventIds: [],
    worldEntryIds: [],
    relatedEntryIds: [],
    characterLinks: {},
    countryLinks: {},
    eventLinks: {},
    entryLinks: {},
  }
}

function normalizeSection(section: LegacyCustomSection): CustomSection {
  const entries = Array.isArray(section.entries)
    ? section.entries.map((entry) => ({
        ...entry,
        note: entry.note ?? '',
        headerUrl: entry.headerUrl ?? '',
        avatarUrl: entry.avatarUrl ?? '',
        gallery: entry.gallery ?? [],
        characterIds: entry.characterIds ?? [],
        countryIds: entry.countryIds ?? [],
        eventIds: entry.eventIds ?? [],
        worldEntryIds: entry.worldEntryIds ?? [],
        relatedEntryIds: entry.relatedEntryIds ?? [],
        eventLinks: entry.eventLinks ?? {},
        entryLinks: entry.entryLinks ?? {},
        characterLinks:
          entry.characterLinks ??
          Object.fromEntries(
            Object.entries(entry.characterAttitudes ?? {}).map(([id, attitude]) => [
              id,
              { attitude },
            ]),
          ),
        countryLinks:
          entry.countryLinks ??
          Object.fromEntries(
            Object.entries(entry.countryAttitudes ?? {}).map(([id, attitude]) => [
              id,
              { attitude },
            ]),
          ),
      }))
    : []
  if (entries.length === 0) {
    const legacyLinks =
      (section.characterIds?.length ?? 0) +
      (section.countryIds?.length ?? 0) +
      (section.eventIds?.length ?? 0) +
      (section.worldEntryIds?.length ?? 0)
    if (legacyLinks > 0) {
      entries.push({
        id: makeId('entry'),
        name: section.name ?? '新条目',
        note: '',
        headerUrl: '',
        avatarUrl: '',
        gallery: [],
        characterIds: section.characterIds ?? [],
        countryIds: section.countryIds ?? [],
        eventIds: section.eventIds ?? [],
        worldEntryIds: section.worldEntryIds ?? [],
        relatedEntryIds: [],
        characterLinks: {},
        countryLinks: {},
        eventLinks: {},
        entryLinks: {},
      })
    }
  }
  return {
    id: section.id ?? makeId('custom'),
    name: section.name ?? '新分类',
    accentColor: resolveAccentColor(section.accentColor, section.name ?? '新分类'),
    description: section.description ?? '',
    preset: section.preset === 'weapon' || section.preset === 'pet' ? section.preset : undefined,
    entries,
    scopedEdges: section.scopedEdges ?? [],
    characterIds: section.characterIds ?? [],
    countryIds: section.countryIds ?? [],
    eventIds: section.eventIds ?? [],
    worldEntryIds: section.worldEntryIds ?? [],
    relatedSectionIds: section.relatedSectionIds ?? [],
    edgeLabels: section.edgeLabels ?? {},
  }
}

function symmetrizeEntryLinks(sections: CustomSection[]): CustomSection[] {
  const byEntry = new Map<string, { section: CustomSection; entry: CustomEntry }>()
  for (const section of sections) {
    for (const entry of section.entries) byEntry.set(entry.id, { section, entry })
  }

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      let next = entry
      for (const targetId of entry.relatedEntryIds ?? []) {
        const target = byEntry.get(targetId)
        if (!target || target.entry.id === entry.id) continue
        const label =
          next.entryLinks?.[targetId]?.relation ||
          target.entry.entryLinks?.[entry.id]?.relation ||
          '相关'
        next = {
          ...next,
          entryLinks: {
            ...(next.entryLinks ?? {}),
            [targetId]: { ...(next.entryLinks?.[targetId] ?? {}), relation: label },
          },
        }
        if (!target.entry.relatedEntryIds.includes(entry.id)) {
          target.entry.relatedEntryIds = [...target.entry.relatedEntryIds, entry.id]
          target.entry.entryLinks = {
            ...(target.entry.entryLinks ?? {}),
            [entry.id]: {
              ...(target.entry.entryLinks?.[entry.id] ?? {}),
              relation: label,
            },
          }
        }
      }
      return next
    }),
  }))
}

function loadCustomSections(): CustomSection[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LegacyCustomSection[]
    return Array.isArray(parsed)
      ? symmetrizeEntryLinks(parsed.map(normalizeSection))
      : []
  } catch {
    return []
  }
}

function saveCustomSections(sections: CustomSection[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getCustomSection(id: string): CustomSection | null {
  return loadCustomSections().find((section) => section.id === id) ?? null
}

const PRESET_DEFINITIONS: Array<{
  name: string
  preset: 'weapon' | 'pet'
  description: string
}> = [
  { name: '武器', preset: 'weapon', description: '武器、装备与道具' },
  { name: '宠物', preset: 'pet', description: '宠物、伙伴与召唤物' },
]

export function getPresetSection(preset: 'weapon' | 'pet'): CustomSection | null {
  return loadCustomSections().find((section) => section.preset === preset) ?? null
}

export interface PresetEntryTransfer {
  preset: 'weapon' | 'pet'
  name: string
  note: string
  avatarUrl: string
  headerUrl: string
  gallery: string[]
  characterIds: number[]
}

/** 旧版把武器/宠物存在自定义分类里；迁移到角色模板实体时取出条目。 */
export function listPresetEntries(): PresetEntryTransfer[] {
  const result: PresetEntryTransfer[] = []
  for (const section of loadCustomSections()) {
    if (!section.preset) continue
    for (const entry of section.entries) {
      result.push({
        preset: section.preset,
        name: entry.name,
        note: entry.note,
        avatarUrl: entry.avatarUrl ?? '',
        headerUrl: entry.headerUrl ?? '',
        gallery: entry.gallery ?? [],
        characterIds: entry.characterIds ?? [],
      })
    }
  }
  return result
}

export function clearPresetEntries(): void {
  const current = loadCustomSections()
  if (!current.some((section) => section.preset && section.entries.length > 0)) return
  saveCustomSections(
    current.map((section) =>
      section.preset ? { ...section, entries: [] } : section,
    ),
  )
}

/**
 * “武器”“宠物”是“创作”区的永久分类：
 * - 始终存在；用户删除后下次进入会重新创建。
 * - 旧版本按名称创建的“武器/宠物”分类会原地升级为预设分类，保留条目。
 */
export function ensurePresetSections(): void {
  if (typeof window === 'undefined') return
  const current = loadCustomSections()
  let changed = false
  const next = current.map((section) => {
    const definition = section.preset
      ? PRESET_DEFINITIONS.find((item) => item.preset === section.preset)
      : PRESET_DEFINITIONS.find((item) => item.name === section.name)
    if (!definition) return section
    if (section.preset === definition.preset && section.name === definition.name) {
      return section
    }
    changed = true
    return { ...section, preset: definition.preset, name: definition.name }
  })
  for (const definition of PRESET_DEFINITIONS) {
    if (next.some((section) => section.preset === definition.preset)) continue
    changed = true
    next.push({
      id: makeId('custom'),
      name: definition.name,
      accentColor: pickAccentColor(definition.name),
      description: definition.description,
      preset: definition.preset,
      entries: [],
      scopedEdges: [],
      characterIds: [],
      countryIds: [],
      eventIds: [],
      worldEntryIds: [],
      relatedSectionIds: [],
      edgeLabels: {},
    })
  }
  if (changed) saveCustomSections(next)
}

export function useCustomSections(): {
  sections: CustomSection[]
  createSection: (name: string, description?: string) => CustomSection
  reorderSections: (sourceId: string, targetId: string) => void
  deleteSection: (id: string) => void
  renameSection: (id: string, name: string) => void
  setSectionDescription: (id: string, description: string) => void
  addEntry: (sectionId: string, name: string) => CustomEntry
  updateEntry: (sectionId: string, entryId: string, patch: Partial<CustomEntry>) => void
  deleteEntry: (sectionId: string, entryId: string) => void
  linkEntity: (sectionId: string, entryId: string, field: CustomLinkField, entityId: number) => void
  unlinkEntity: (sectionId: string, entryId: string, field: CustomLinkField, entityId: number) => void
  linkEntryRelation: (sectionId: string, entryId: string, targetEntryId: string) => void
  unlinkEntryRelation: (sectionId: string, entryId: string, targetEntryId: string) => void
  setEntryRelationLabel: (entryId: string, targetEntryId: string, label: string) => void
  linkSectionEntity: (sectionId: string, field: CustomLinkField, entityId: number) => void
  linkSections: (sourceId: string, targetId: string) => void
  setEdgeLabel: (sectionId: string, edgeId: string, label: string) => void
  addScopedEdge: (sectionId: string, source: string, target: string, label: string) => void
  removeScopedEdge: (sectionId: string, edgeId: string) => void
} {
  // Keep the first client render identical to the server render; localStorage
  // data is loaded after mount to avoid a hydration mismatch.
  const [sections, setSections] = useState<CustomSection[]>([])

  useEffect(() => {
    const reload = (): void => setSections(loadCustomSections())
    reload()
    window.addEventListener(CHANGE_EVENT, reload)
    window.addEventListener('storage', reload)
    return () => {
      window.removeEventListener(CHANGE_EVENT, reload)
      window.removeEventListener('storage', reload)
    }
  }, [])

  const reorderSections = useCallback((sourceId: string, targetId: string): void => {
    if (sourceId === targetId) return
    const current = loadCustomSections()
    const from = current.findIndex((section) => section.id === sourceId)
    const to = current.findIndex((section) => section.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    saveCustomSections(next)
    setSections(next)
  }, [])

  const createSection = useCallback(
    (name: string, description = '', preset?: 'weapon' | 'pet'): CustomSection => {
    const section: CustomSection = {
      id: makeId('custom'),
      name: name.trim() || '新分类',
      accentColor: pickAccentColor(name),
      description: description.trim(),
      preset,
      entries: [],
      scopedEdges: [],
      characterIds: [],
      countryIds: [],
      eventIds: [],
      worldEntryIds: [],
      relatedSectionIds: [],
      edgeLabels: {},
    }
    const next = [...loadCustomSections(), section]
    saveCustomSections(next)
    setSections(next)
    return section
    },
    [],
  )

  const deleteSection = useCallback((id: string) => {
    const current = loadCustomSections()
    // “武器”“宠物”是永久分类，不允许删除。
    if (current.some((section) => section.id === id && section.preset)) return
    const next = current.filter((section) => section.id !== id)
    saveCustomSections(next)
    setSections(next)
  }, [])

  const renameSection = useCallback((id: string, name: string) => {
    const current = loadCustomSections()
    if (current.some((section) => section.id === id && section.preset)) return
    const next = current.map((section) =>
      section.id === id ? { ...section, name: name.trim() || section.name } : section,
    )
    saveCustomSections(next)
    setSections(next)
  }, [])

  const setSectionDescription = useCallback((id: string, description: string) => {
    const next = loadCustomSections().map((section) =>
      section.id === id ? { ...section, description } : section,
    )
    saveCustomSections(next)
    setSections(next)
  }, [])

  const addEntry = useCallback((sectionId: string, name: string): CustomEntry => {
    const entry = makeEntry(name)
    const next = loadCustomSections().map((section) =>
      section.id === sectionId
        ? { ...section, entries: [...section.entries, entry] }
        : section,
    )
    saveCustomSections(next)
    setSections(next)
    return entry
  }, [])

  const updateEntry = useCallback(
    (sectionId: string, entryId: string, patch: Partial<CustomEntry>) => {
      const next = loadCustomSections().map((section) =>
        section.id === sectionId
          ? {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === entryId ? { ...entry, ...patch } : entry,
              ),
            }
          : section,
      )
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const deleteEntry = useCallback((sectionId: string, entryId: string) => {
    const next = loadCustomSections().map((section) =>
      section.id === sectionId
        ? { ...section, entries: section.entries.filter((entry) => entry.id !== entryId) }
        : section,
    )
    saveCustomSections(next)
    setSections(next)
  }, [])

  const linkEntity = useCallback(
    (sectionId: string, entryId: string, field: CustomLinkField, entityId: number) => {
      const next = loadCustomSections().map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              entries: section.entries.map((entry) => {
                if (entry.id !== entryId) return entry
                return entry[field].includes(entityId)
                  ? entry
                  : { ...entry, [field]: [...entry[field], entityId] }
              }),
            },
      )
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const unlinkEntity = useCallback(
    (sectionId: string, entryId: string, field: CustomLinkField, entityId: number) => {
      const next = loadCustomSections().map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              entries: section.entries.map((entry) =>
                entry.id === entryId
                  ? { ...entry, [field]: entry[field].filter((item) => item !== entityId) }
                  : entry,
              ),
            },
      )
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const linkEntryRelation = useCallback(
    (sectionId: string, entryId: string, targetEntryId: string): void => {
      if (entryId === targetEntryId) return
      const current = loadCustomSections()
      const targetExists = current.some((section) =>
        section.entries.some((entry) => entry.id === targetEntryId),
      )
      if (!targetExists) return
      const next = current.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id === entryId) {
            if (entry.relatedEntryIds.includes(targetEntryId)) return entry
            return {
              ...entry,
              relatedEntryIds: [...entry.relatedEntryIds, targetEntryId],
              entryLinks: {
                ...entry.entryLinks,
                [targetEntryId]: { relation: '相关' },
              },
            }
          }
          if (entry.id === targetEntryId) {
            if (entry.relatedEntryIds.includes(entryId)) return entry
            return {
              ...entry,
              relatedEntryIds: [...entry.relatedEntryIds, entryId],
              entryLinks: {
                ...entry.entryLinks,
                [entryId]: { relation: '相关' },
              },
            }
          }
          return entry
        }),
      }))
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const unlinkEntryRelation = useCallback(
    (sectionId: string, entryId: string, targetEntryId: string): void => {
      const next = loadCustomSections().map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id !== entryId && entry.id !== targetEntryId) return entry
          const otherId = entry.id === entryId ? targetEntryId : entryId
          const { [otherId]: _removed, ...entryLinks } = entry.entryLinks ?? {}
          void _removed
          return {
            ...entry,
            relatedEntryIds: entry.relatedEntryIds.filter((id) => id !== otherId),
            entryLinks,
          }
        }),
      }))
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const setEntryRelationLabel = useCallback(
    (entryId: string, targetEntryId: string, label: string): void => {
      const nextLabel = label.trim() || '相关'
      const next = loadCustomSections().map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id !== entryId && entry.id !== targetEntryId) return entry
          const otherId = entry.id === entryId ? targetEntryId : entryId
          return {
            ...entry,
            entryLinks: {
              ...(entry.entryLinks ?? {}),
              [otherId]: { ...(entry.entryLinks?.[otherId] ?? {}), relation: nextLabel },
            },
          }
        }),
      }))
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const linkSectionEntity = useCallback(
    (sectionId: string, field: CustomLinkField, entityId: number) => {
      const next = loadCustomSections().map((section) =>
        section.id !== sectionId
          ? section
          : section[field].includes(entityId)
            ? section
            : { ...section, [field]: [...section[field], entityId] },
      )
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  const linkSections = useCallback((sourceId: string, targetId: string) => {
    const next = loadCustomSections().map((section) => {
      if (section.id === sourceId && !section.relatedSectionIds.includes(targetId)) {
        return { ...section, relatedSectionIds: [...section.relatedSectionIds, targetId] }
      }
      if (section.id === targetId && !section.relatedSectionIds.includes(sourceId)) {
        return { ...section, relatedSectionIds: [...section.relatedSectionIds, sourceId] }
      }
      return section
    })
    saveCustomSections(next)
    setSections(next)
  }, [])

  const setEdgeLabel = useCallback((sectionId: string, edgeId: string, label: string) => {
    const next = loadCustomSections().map((section) =>
      section.id === sectionId
        ? { ...section, edgeLabels: { ...section.edgeLabels, [edgeId]: label } }
        : section,
    )
    saveCustomSections(next)
    setSections(next)
  }, [])

  const removeScopedEdge = useCallback((sectionId: string, edgeId: string): void => {
    const next = loadCustomSections().map((section) =>
      section.id === sectionId
        ? {
            ...section,
            scopedEdges: section.scopedEdges.filter((edge) => edge.id !== edgeId),
          }
        : section,
    )
    saveCustomSections(next)
    setSections(next)
  }, [])

  const addScopedEdge = useCallback(
    (sectionId: string, source: string, target: string, label: string) => {
      const id = `scoped-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const next = loadCustomSections().map((section) =>
        section.id === sectionId
          ? {
              ...section,
              scopedEdges: [
                ...section.scopedEdges,
                { id, source, target, label: label || '相关' },
              ],
            }
          : section,
      )
      saveCustomSections(next)
      setSections(next)
    },
    [],
  )

  return {
    sections,
    createSection,
    reorderSections,
    deleteSection,
    renameSection,
    setSectionDescription,
    addEntry,
    updateEntry,
    deleteEntry,
    linkEntity,
    unlinkEntity,
    linkEntryRelation,
    unlinkEntryRelation,
    setEntryRelationLabel,
    linkSectionEntity,
    linkSections,
    setEdgeLabel,
    addScopedEdge,
    removeScopedEdge,
  }
}
