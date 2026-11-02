'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Link2, Network, Plus, Trash2 } from 'lucide-react'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { useCustomSections, type CustomLinkField } from './store'
import { accentGradient, resolveAccentColor } from '@/lib/entity-accent'
import { CustomSectionGraph } from './CustomSectionGraph'
import { AppConfirm } from '@/components/shared/AppConfirm'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { ImageGallery } from '@/components/shared/ImageGallery'

interface CustomSectionViewProps {
  sectionId: string
  onDeleted: () => void
}

interface EntityRow {
  id: number
  label: string
  meta?: string
}

function LinkCard({
  title,
  linked,
  options,
  selected,
  onSelect,
  onAdd,
  onRemove,
  meta,
  onMetaChange,
  compact = false,
}: {
  title: string
  linked: EntityRow[]
  options: EntityRow[]
  selected: string
  onSelect: (value: string) => void
  onAdd: () => void
  onRemove: (id: number) => void
  meta?: Record<string, { relation?: string; role?: string; position?: string; contribution?: string; attitude?: string }>
  onMetaChange?: (
    id: number,
    patch: { relation?: string; role?: string; position?: string; contribution?: string; attitude?: string },
  ) => void
  compact?: boolean
}) {
  const linkedIds = new Set(linked.map((row) => row.id))
  const available = options.filter((row) => !linkedIds.has(row.id))

  return (
    <section className="rounded-xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-sm text-ink">{title}</h3>
        <span className="text-[10px] text-ink-faint">{linked.length} 项</span>
      </div>
      <div className="mb-3 flex flex-col gap-2">
        {linked.length === 0 ? (
          <span className="text-[11px] text-ink-faint">还没有关联内容</span>
        ) : meta && onMetaChange ? (
          linked.map((row) => {
            const value = meta[String(row.id)] ?? {}
            const update = (patch: Partial<typeof value>): void =>
              onMetaChange(row.id, { ...value, ...patch })
            return (
              <div key={row.id} className="rounded-lg border border-line bg-paper-card p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">{row.label}</span>
                  <button
                    onClick={() => onRemove(row.id)}
                    className="text-ink-faint hover:text-error"
                    title="取消关联"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={value.relation ?? ''}
                    onChange={(event) => update({ relation: event.target.value })}
                    placeholder="与这个条目的关系"
                    className="h-7 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                  />
                  {compact ? (
                    <input
                      value={value.position ?? ''}
                      onChange={(event) => update({ position: event.target.value })}
                      placeholder="自定义内容，添加你的描述"
                      className="col-span-2 h-9 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                    />
                  ) : (
                    <>
                      <input
                        value={value.role ?? ''}
                        onChange={(event) => update({ role: event.target.value })}
                        placeholder="职责 / 职位，例如教会首领"
                        className="h-7 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                      />
                      <input
                        value={value.contribution ?? ''}
                        onChange={(event) => update({ contribution: event.target.value })}
                        placeholder="贡献"
                        className="h-7 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                      />
                      <input
                        value={value.attitude ?? ''}
                        onChange={(event) => update({ attitude: event.target.value })}
                        placeholder="对这个条目的态度"
                        className="h-7 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                      />
                      <input
                        value={value.position ?? ''}
                        onChange={(event) => update({ position: event.target.value })}
                        placeholder="自定义内容，添加你的描述"
                        className="col-span-2 h-9 rounded border border-line bg-paper px-2 text-[10px] text-ink outline-none placeholder:text-ink-faint"
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          linked.map((row) => (
            <span
              key={row.id}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper-card px-2 py-1 text-[11px] text-ink-muted"
            >
              {row.label}
              {row.meta ? <span className="text-[9px] text-ink-faint">{row.meta}</span> : null}
              <button
                onClick={() => onRemove(row.id)}
                className="text-ink-faint hover:text-error"
                title="取消关联"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-1.5">
        <select
          value={selected}
          onChange={(event) => onSelect(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-paper-card px-2 text-xs text-ink outline-none"
        >
          <option value="">选择要关联的内容</option>
          {available.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
              {row.meta ? ` · ${row.meta}` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={onAdd}
          disabled={!selected}
          className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={2} />
          关联
        </button>
      </div>
    </section>
  )
}

export function CustomSectionView({ sectionId, onDeleted }: CustomSectionViewProps) {
  const {
    sections,
    renameSection,
    setSectionDescription,
    deleteSection,
    addEntry,
    updateEntry,
    setEntryRelationLabel,
    deleteEntry,
    linkEntity,
    unlinkEntity,
    linkEntryRelation,
    unlinkEntryRelation,
  } = useCustomSections()
  const section = sections.find((item) => item.id === sectionId)
  const { characters } = useCharacterList()
  const { countries } = useCountryList()
  const { events } = useEventList()
  const { entries: worldEntries } = useEntryList()

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newEntryName, setNewEntryName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(section?.name ?? '')
  const [selectedCharacter, setSelectedCharacter] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('')
  const [selectedWorld, setSelectedWorld] = useState('')
  const [selectedRelatedEntry, setSelectedRelatedEntry] = useState('')
  const [showGraph, setShowGraph] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'entry' | 'section'; id: string; name: string } | null
  >(null)

  const entry = section?.entries.find((item) => item.id === selectedEntryId) ?? null

  useEffect(() => {
    if (!section) return
    const key = `oc-focus-custom-entry:${section.id}`
    const target = window.localStorage.getItem(key)
    if (!target) return
    if (section.entries.some((item) => item.id === target)) setSelectedEntryId(target)
    window.localStorage.removeItem(key)
  }, [section])

  const allCharacters = useMemo<EntityRow[]>(
    () =>
      characters
        .filter((item) => typeof item.id === 'number')
        .map((item) => ({ id: item.id as number, label: item.name })),
    [characters],
  )
  const allCountries = useMemo<EntityRow[]>(
    () =>
      countries
        .filter((item) => typeof item.id === 'number')
        .map((item) => ({ id: item.id as number, label: item.name })),
    [countries],
  )
  const allEvents = useMemo<EntityRow[]>(
    () =>
      events
        .filter((item) => typeof item.id === 'number')
        .map((item) => ({ id: item.id as number, label: item.title, meta: item.time })),
    [events],
  )
  const allWorld = useMemo<EntityRow[]>(
    () =>
      worldEntries
        .filter((item) => typeof item.id === 'number')
        .map((item) => ({ id: item.id as number, label: item.title })),
    [worldEntries],
  )

  const linkedRows = (ids: number[], options: EntityRow[]): EntityRow[] =>
    ids
      .map((id) => options.find((row) => row.id === id))
      .filter((row): row is EntityRow => Boolean(row))

  const relatedEntryOptions = entry
    ? sections.flatMap((item) =>
        item.entries
          .filter((candidate) => candidate.id !== entry.id)
          .map((candidate) => ({
            id: candidate.id,
            label: candidate.name,
            sectionId: item.id,
            sectionName: item.name,
          })),
      )
    : []

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        分类不存在
      </div>
    )
  }

  const accent = resolveAccentColor(section.accentColor, section.name)
  const isPreset = Boolean(section.preset)

  if (showGraph) {
    return (
      <CustomSectionGraph
        section={section}
        onBack={() => setShowGraph(false)}
        onSelectEntry={(entryId) => {
          setSelectedEntryId(entryId)
          setShowGraph(false)
        }}
      />
    )
  }

  const addLink = (field: CustomLinkField, raw: string): void => {
    if (!entry) return
    const id = Number(raw)
    if (Number.isFinite(id)) linkEntity(section.id, entry.id, field, id)
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        {entry ? (
          <>
            <button
              onClick={() => setSelectedEntryId(null)}
              className="mb-4 flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} strokeWidth={2} />
              返回{section.name}列表
            </button>

            <div className="mb-5 max-w-sm">
              <ProfileBannerEditor
                headerUrl={entry.headerUrl}
                avatarUrl={entry.avatarUrl}
                accentColor={section.accentColor}
                onHeaderChange={(path) =>
                  updateEntry(section.id, entry.id, { headerUrl: path })
                }
                onAvatarChange={(path) =>
                  updateEntry(section.id, entry.id, { avatarUrl: path })
                }
                onHeaderRemove={() => updateEntry(section.id, entry.id, { headerUrl: '' })}
                onAvatarRemove={() => updateEntry(section.id, entry.id, { avatarUrl: '' })}
              />
            </div>

            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-widest text-ink-faint">
                {section.name}
              </p>
              <input
                value={entry.name}
                onChange={(event) =>
                  updateEntry(section.id, entry.id, { name: event.target.value })
                }
                className="mt-1 w-full border-none bg-transparent font-serif text-2xl text-ink outline-none"
              />
              <textarea
                value={entry.note}
                onChange={(event) =>
                  updateEntry(section.id, entry.id, { note: event.target.value })
                }
                placeholder={`记录这个${section.name}的设定、来历、教义……`}
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-line bg-paper-card p-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={() => setShowGraph(true)}
                className="mt-2 flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-ink-muted hover:border-line-hover hover:text-ink"
              >
                <Network size={12} strokeWidth={2} />
                查看关系网
              </button>
            </div>

            <div className="grid gap-3">
              <LinkCard
                title={`${entry.name} · 相关人物`}
                linked={linkedRows(entry.characterIds, allCharacters)}
                options={allCharacters}
                selected={selectedCharacter}
                onSelect={setSelectedCharacter}
                onAdd={() => {
                  addLink('characterIds', selectedCharacter)
                  setSelectedCharacter('')
                }}
                onRemove={(id) => unlinkEntity(section.id, entry.id, 'characterIds', id)}
                meta={entry.characterLinks}
                onMetaChange={(id, patch) =>
                  updateEntry(section.id, entry.id, {
                    characterLinks: {
                      ...entry.characterLinks,
                      [String(id)]: { ...entry.characterLinks[String(id)], ...patch },
                    },
                  })
                }
              />
              <LinkCard
                title={`${entry.name} · 相关国家`}
                linked={linkedRows(entry.countryIds, allCountries)}
                options={allCountries}
                selected={selectedCountry}
                onSelect={setSelectedCountry}
                onAdd={() => {
                  addLink('countryIds', selectedCountry)
                  setSelectedCountry('')
                }}
                onRemove={(id) => unlinkEntity(section.id, entry.id, 'countryIds', id)}
                meta={entry.countryLinks}
                onMetaChange={(id, patch) =>
                  updateEntry(section.id, entry.id, {
                    countryLinks: {
                      ...entry.countryLinks,
                      [String(id)]: { ...entry.countryLinks[String(id)], ...patch },
                    },
                  })
                }
              />
              <LinkCard
                title={`${entry.name} · 相关事件`}
                linked={linkedRows(entry.eventIds, allEvents)}
                options={allEvents}
                selected={selectedEvent}
                onSelect={setSelectedEvent}
                onAdd={() => {
                  addLink('eventIds', selectedEvent)
                  setSelectedEvent('')
                }}
                onRemove={(id) => unlinkEntity(section.id, entry.id, 'eventIds', id)}
                meta={entry.eventLinks}
                compact
                onMetaChange={(id, patch) =>
                  updateEntry(section.id, entry.id, {
                    eventLinks: {
                      ...(entry.eventLinks ?? {}),
                      [String(id)]: { ...(entry.eventLinks?.[String(id)] ?? {}), ...patch },
                    },
                  })
                }
              />
              <LinkCard
                title={`${entry.name} · 相关世界观`}
                linked={linkedRows(entry.worldEntryIds, allWorld)}
                options={allWorld}
                selected={selectedWorld}
                onSelect={setSelectedWorld}
                onAdd={() => {
                  addLink('worldEntryIds', selectedWorld)
                  setSelectedWorld('')
                }}
                onRemove={(id) => unlinkEntity(section.id, entry.id, 'worldEntryIds', id)}
              />

              <section className="rounded-xl border border-line bg-paper p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm text-ink">{entry.name} · 其他关系</h3>
                  <span className="text-[10px] text-ink-faint">
                    {entry.relatedEntryIds.length} 项
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedRelatedEntry}
                    onChange={(event) => setSelectedRelatedEntry(event.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 text-xs text-ink outline-none"
                  >
                    <option value="">选择一个分类下的条目</option>
                    {sections.map((item) => {
                      const options = relatedEntryOptions.filter(
                        (option) => option.sectionId === item.id,
                      )
                      if (options.length === 0) return null
                      return (
                        <optgroup key={item.id} label={item.name}>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                  <button
                    onClick={() => {
                      if (!selectedRelatedEntry) return
                      linkEntryRelation(section.id, entry.id, selectedRelatedEntry)
                      setSelectedRelatedEntry('')
                    }}
                    disabled={!selectedRelatedEntry}
                    className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
                  >
                    <Plus size={12} strokeWidth={2} />
                    加入关系
                  </button>
                </div>
                {entry.relatedEntryIds.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {entry.relatedEntryIds.map((targetId) => {
                      const target = sections
                        .flatMap((item) => item.entries)
                        .find((candidate) => candidate.id === targetId)
                      if (!target) return null
                      return (
                        <div key={targetId} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-xs text-ink">
                            {target.name}
                          </span>
                          <input
                            value={entry.entryLinks?.[targetId]?.relation ?? '相关'}
                            onChange={(event) =>
                              setEntryRelationLabel(entry.id, targetId, event.target.value)
                            }
                            placeholder="关系，例如敌对、盟友"
                            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 text-xs text-ink outline-none placeholder:text-ink-faint"
                          />
                          <button
                            onClick={() =>
                              unlinkEntryRelation(section.id, entry.id, targetId)
                            }
                            className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:text-error"
                            title="移除关系"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-ink-faint">
                    可以从其他自定义分类中选择条目，例如保守党、大地与自然之神。
                  </p>
                )}
              </section>
            </div>

            <section className="mt-4 rounded-xl border border-line bg-paper p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm text-ink">{entry.name} · 相册</h3>
                <span className="text-[10px] text-ink-faint">
                  {(entry.gallery ?? []).length} 张
                </span>
              </div>
              <ImageGallery
                mode="grid"
                images={entry.gallery ?? []}
                onAdd={(path) =>
                  updateEntry(section.id, entry.id, {
                    gallery: [...(entry.gallery ?? []), path],
                  })
                }
                onRemove={(index) =>
                  updateEntry(section.id, entry.id, {
                    gallery: (entry.gallery ?? []).filter((_, i) => i !== index),
                  })
                }
              />
            </section>

            <button
              onClick={() =>
                setPendingDelete({ kind: 'entry', id: entry.id, name: entry.name })
              }
              className="mt-5 flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:border-error/50 hover:text-error"
            >
              <Trash2 size={13} strokeWidth={2} />
              删除这个{section.name}
            </button>
          </>
        ) : (
          <>
            <div
              className="mb-8 flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-4"
              style={{ backgroundImage: accentGradient(accent), borderColor: `${accent}45` }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink-faint">
                  {isPreset ? '创作分类' : '自定义分类'}
                </p>
                {editingName && !isPreset ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      autoFocus
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          renameSection(section.id, name)
                          setEditingName(false)
                        }
                        if (event.key === 'Escape') setEditingName(false)
                      }}
                      className="h-9 rounded-lg border border-line bg-paper-card px-2 font-serif text-2xl text-ink outline-none"
                    />
                    <button
                      onClick={() => {
                        renameSection(section.id, name)
                        setEditingName(false)
                      }}
                      className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <h1
                    className={
                      isPreset
                        ? 'font-serif text-2xl text-ink'
                        : 'cursor-text font-serif text-2xl text-ink'
                    }
                    onClick={
                      isPreset
                        ? undefined
                        : () => {
                            setName(section.name)
                            setEditingName(true)
                          }
                    }
                    title={isPreset ? '固定分类，不可重命名' : '点击重命名分类'}
                  >
                    {section.name}
                  </h1>
                )}
                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                  <Link2 size={12} strokeWidth={2} />
                  {section.entries.length} 个{section.name}
                </p>
                <input
                  value={section.description}
                  onChange={(event) =>
                    setSectionDescription(section.id, event.target.value)
                  }
                  placeholder="分类描述，例如：地图分类"
                  className="mt-2 h-8 w-full max-w-md rounded-lg border border-line bg-paper-card px-2 text-xs text-ink-muted outline-none placeholder:text-ink-faint"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGraph(true)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
                >
                  <Network size={13} strokeWidth={2} />
                  关系网
                </button>
                <button
                  onClick={() => {
                    setCreating(true)
                    setNewEntryName('')
                  }}
                  className="flex h-8 items-center gap-1 rounded-lg bg-ink px-3 text-xs text-paper hover:opacity-90"
                >
                  <Plus size={13} strokeWidth={2} />
                  添加{section.name}
                </button>
                {!isPreset ? (
                  <button
                    onClick={() =>
                      setPendingDelete({ kind: 'section', id: section.id, name: section.name })
                    }
                    className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-muted hover:border-error/50 hover:text-error"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                    删除分类
                  </button>
                ) : null}
              </div>
            </div>

            {section.entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <p className="text-sm text-ink-muted">
                  还没有{section.name}。先添加一个。
                </p>
                <button
                  onClick={() => setCreating(true)}
                  className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs text-paper hover:opacity-90"
                >
                  添加{section.name}
                </button>
              </div>
            ) : (
              <div className="mt-2 grid gap-2">
                {section.entries.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedEntryId(item.id)}
                    style={{ backgroundImage: accentGradient(accent), borderColor: `${accent}35` }}
                    className="rounded-xl border bg-paper p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-hover hover:bg-paper-card"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-serif text-base text-ink">{item.name}</span>
                      <span className="shrink-0 text-[10px] text-ink-faint">
                        {item.characterIds.length +
                          item.countryIds.length +
                          item.eventIds.length +
                          item.worldEntryIds.length}{' '}
                        项关联
                      </span>
                    </div>
                    {item.note ? (
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">{item.note}</p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-faint">还没有简介</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {creating ? createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
            onClick={(event) => {
              if (event.target === event.currentTarget) setCreating(false)
            }}
          >
            <div className="w-[340px] rounded-xl border border-line bg-paper p-4 shadow-xl">
              <h3 className="font-serif text-base text-ink">添加{section.name}</h3>
              <input
                autoFocus
                value={newEntryName}
                onChange={(event) => setNewEntryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newEntryName.trim()) {
                    const created = addEntry(section.id, newEntryName)
                    setSelectedEntryId(created.id)
                    setCreating(false)
                  }
                  if (event.key === 'Escape') setCreating(false)
                }}
                placeholder={`${section.name}名称`}
                className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setCreating(false)}
                  className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (!newEntryName.trim()) return
                    const created = addEntry(section.id, newEntryName)
                    setSelectedEntryId(created.id)
                    setCreating(false)
                  }}
                  disabled={!newEntryName.trim()}
                  className="h-8 rounded-lg bg-ink px-3 text-xs text-paper disabled:opacity-40"
                >
                  创建
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        <AppConfirm
          open={pendingDelete !== null}
          title={pendingDelete?.kind === 'section' ? '删除分类' : `删除${section.name}`}
          description={
            pendingDelete?.kind === 'section'
              ? `确定删除分类「${pendingDelete.name}」？其中的所有条目和关联关系都会删除，原人物、国家等内容不会受影响。`
              : pendingDelete
                ? `确定删除「${pendingDelete.name}」？`
                : undefined
          }
          confirmLabel={pendingDelete?.kind === 'section' ? '删除分类' : '删除'}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (!pendingDelete) return
            if (pendingDelete.kind === 'section') {
              deleteSection(pendingDelete.id)
              onDeleted()
            } else {
              deleteEntry(section.id, pendingDelete.id)
              setSelectedEntryId(null)
            }
            setPendingDelete(null)
          }}
        />
      </div>
    </div>
  )
}
