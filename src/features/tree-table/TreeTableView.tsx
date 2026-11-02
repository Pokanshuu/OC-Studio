'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  Search,
  Table2,
  Trash2,
  Users,
  CalendarDays,
  Shapes,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Character, Country, Tag, WorldEntry } from '@/types'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { updateEntry, deleteEntry, createEntry } from '@/features/world/services'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { updateCountry, deleteCountry, createCountry } from '@/features/countries/services'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { updateCharacter, deleteCharacter, createCharacter } from '@/features/characters/services'
import { useTags } from '@/features/tags/hooks/useTags'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useCustomSections } from '@/features/custom-sections'
import { EditableCell } from './components/EditableCell'

type TabId = 'world' | 'country' | 'character' | 'event' | 'custom'
type RowKind = 'world' | 'country' | 'character' | 'group'

interface Row {
  key: string
  kind: RowKind
  depth: number
  label: string
  hasChildren: boolean
  expanded: boolean
  childCount?: number
  id?: number
  parentId?: number | null
  countryId?: number
  entry?: WorldEntry
  country?: Country
  character?: Character
}

interface Selection {
  kind: RowKind
  id?: number
  countryId?: number
}

const TABS: Array<{ id: TabId; label: string; icon: typeof BookOpen }> = [
  { id: 'world', label: '词条', icon: BookOpen },
  { id: 'country', label: '国家', icon: Flag },
  { id: 'character', label: '角色', icon: Users },
  { id: 'event', label: '事件', icon: CalendarDays },
  { id: 'custom', label: '自定义分类', icon: Shapes },
]

function byWorldOrder(a: WorldEntry, b: WorldEntry): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-CN')
}

function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

function TagChips({ ids, tags }: { ids: number[]; tags: Tag[] }) {
  if (!ids || ids.length === 0) return <span className="text-[10px] text-ink-faint">—</span>
  const resolved = ids.map((id) => tags.find((tag) => tag.id === id)).filter(Boolean) as Tag[]
  if (resolved.length === 0) return <span className="text-[10px] text-ink-faint">—</span>
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {resolved.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-[92px] truncate rounded border px-1.5 py-0.5 text-[9px]"
          style={{
            color: tag.color,
            borderColor: `${tag.color}55`,
            background: `${tag.color}14`,
          }}
        >
          {tag.name}
        </span>
      ))}
      {resolved.length > 3 ? (
        <span className="text-[9px] text-ink-faint">+{resolved.length - 3}</span>
      ) : null}
    </div>
  )
}

export function TreeTableView() {
  const { entries, loading: entriesLoading, refresh: refreshEntries } = useEntryList()
  const { countries, loading: countriesLoading, refresh: refreshCountries } = useCountryList()
  const { characters, loading: charactersLoading, refresh: refreshCharacters } = useCharacterList()
  const { events, loading: eventsLoading, refresh: refreshEvents } = useEventList()
  const { sections } = useCustomSections()
  const { tags } = useTags()

  const [tab, setTab] = useState<TabId>('world')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Selection | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const initializedTabs = useRef<Set<TabId>>(new Set())

  const query = search.trim().toLowerCase()
  const tagName = useCallback(
    (ids: number[]): string =>
      ids
        .map((id) => tags.find((tag) => tag.id === id)?.name ?? '')
        .filter(Boolean)
        .join(' '),
    [tags],
  )

  const worldRows = useMemo<Row[]>(() => {
    const ids = new Set(entries.map((entry) => entry.id as number))
    const children = new Map<number | null, WorldEntry[]>()
    for (const entry of entries) {
      const parent = entry.parentId !== null && entry.parentId !== undefined && ids.has(entry.parentId)
        ? entry.parentId
        : null
      const list = children.get(parent) ?? []
      list.push(entry)
      children.set(parent, list)
    }
    for (const list of children.values()) list.sort(byWorldOrder)
    const match = (entry: WorldEntry): boolean => {
      if (!query) return true
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query) ||
        tagName(entry.tags ?? []).toLowerCase().includes(query)
      )
    }
    const walk = (entry: WorldEntry, depth: number): Row[] => {
      const key = `world:${entry.id}`
      const childEntries = children.get(entry.id as number) ?? []
      const childRows = childEntries.flatMap((child) => walk(child, depth + 1))
      if (query && !match(entry) && childRows.length === 0) return []
      const open = query ? true : expanded.has(key)
      const row: Row = {
        key,
        kind: 'world',
        depth,
        label: entry.title,
        hasChildren: childEntries.length > 0,
        expanded: open,
        childCount: childEntries.length,
        id: entry.id,
        parentId: entry.parentId,
        entry,
      }
      return open ? [row, ...childRows] : [row]
    }
    return (children.get(null) ?? []).flatMap((entry) => walk(entry, 0))
  }, [entries, expanded, query, tagName])

  const countryRows = useMemo<Row[]>(() => {
    const ids = new Set(countries.map((country) => country.id as number))
    const children = new Map<number | null, Country[]>()
    for (const country of countries) {
      const parent =
        country.parentId !== null && country.parentId !== undefined && ids.has(country.parentId)
          ? country.parentId
          : null
      const list = children.get(parent) ?? []
      list.push(country)
      children.set(parent, list)
    }
    for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    const match = (country: Country): boolean => {
      if (!query) return true
      return (
        country.name.toLowerCase().includes(query) ||
        country.system.toLowerCase().includes(query) ||
        tagName(country.tags ?? []).toLowerCase().includes(query)
      )
    }
    const walk = (country: Country, depth: number): Row[] => {
      const key = `country:${country.id}`
      const childCountries = children.get(country.id as number) ?? []
      const childRows = childCountries.flatMap((child) => walk(child, depth + 1))
      if (query && !match(country) && childRows.length === 0) return []
      const open = query ? true : expanded.has(key)
      const row: Row = {
        key,
        kind: 'country',
        depth,
        label: country.name,
        hasChildren: childCountries.length > 0,
        expanded: open,
        childCount: childCountries.length,
        id: country.id,
        parentId: country.parentId,
        country,
      }
      return open ? [row, ...childRows] : [row]
    }
    return (children.get(null) ?? []).flatMap((country) => walk(country, 0))
  }, [countries, expanded, query, tagName])

  const characterRows = useMemo<Row[]>(() => {
    const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    const byCountry = new Map<number, Character[]>()
    const unassigned: Character[] = []
    for (const character of characters) {
      if (character.countryId !== undefined && sortedCountries.some((c) => c.id === character.countryId)) {
        const list = byCountry.get(character.countryId) ?? []
        list.push(character)
        byCountry.set(character.countryId, list)
      } else {
        unassigned.push(character)
      }
    }
    for (const list of byCountry.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    unassigned.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

    const matchCharacter = (character: Character): boolean => {
      if (!query) return true
      return (
        character.name.toLowerCase().includes(query) ||
        character.race.toLowerCase().includes(query) ||
        character.occupation.toLowerCase().includes(query) ||
        tagName(character.tags ?? []).toLowerCase().includes(query)
      )
    }

    const rows: Row[] = []
    const pushGroup = (country: Country | null, members: Character[]): void => {
      const key = country ? `group:${country.id}` : 'group:unassigned'
      const matching = members.filter(matchCharacter)
      const countryMatches = country ? country.name.toLowerCase().includes(query) : '未归属'.includes(query)
      if (query && !countryMatches && matching.length === 0) return
      // 空国家组在无搜索时没有信息量，隐藏以减少噪声。
      if (!query && members.length === 0) return
      const visibleMembers = query && !countryMatches ? matching : members
      const open = query ? true : expanded.has(key)
      rows.push({
        key,
        kind: 'group',
        depth: 0,
        label: country?.name ?? '未归属国家',
        hasChildren: visibleMembers.length > 0,
        expanded: open,
        childCount: visibleMembers.length,
        id: country?.id,
        countryId: country?.id,
        country: country ?? undefined,
      })
      if (!open) return
      for (const character of visibleMembers) {
        rows.push({
          key: `character:${character.id}`,
          kind: 'character',
          depth: 1,
          label: character.name,
          hasChildren: false,
          expanded: false,
          id: character.id,
          countryId: character.countryId,
          character,
        })
      }
    }

    for (const country of sortedCountries) pushGroup(country, byCountry.get(country.id as number) ?? [])
    if (unassigned.length > 0 || !query) pushGroup(null, unassigned)
    return rows
  }, [characters, countries, expanded, query, tagName])

  const rows =
    tab === 'event' || tab === 'custom'
      ? []
      : tab === 'world'
        ? worldRows
        : tab === 'country'
          ? countryRows
          : characterRows

  useEffect(() => {
    if (tab === 'event' || tab === 'custom') return
    if (initializedTabs.current.has(tab)) return
    if (tab === 'world' && entriesLoading) return
    if (tab === 'country' && countriesLoading) return
    if (tab === 'character' && (countriesLoading || charactersLoading)) return
    initializedTabs.current.add(tab)
    const keys: string[] = []
    if (tab === 'world') {
      for (const entry of entries) {
        if (entry.parentId === null || entry.parentId === undefined) keys.push(`world:${entry.id}`)
      }
    } else if (tab === 'country') {
      for (const country of countries) {
        if (country.parentId === null || country.parentId === undefined) keys.push(`country:${country.id}`)
      }
    } else {
      for (const country of countries) keys.push(`group:${country.id}`)
      keys.push('group:unassigned')
    }
    setExpanded((prev) => new Set([...prev, ...keys]))
  }, [charactersLoading, countries, countriesLoading, entries, entriesLoading, tab])

  useEffect(() => {
    if (!selected) return
    const exists = rows.some((row) => row.id === selected.id && row.kind === selected.kind)
    if (!exists) setSelected(null)
  }, [rows, selected])

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpanded(new Set(rows.filter((row) => row.hasChildren).map((row) => row.key)))
  }, [rows])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const refreshAll = useCallback(() => {
    window.dispatchEvent(new Event('data-updated'))
  }, [])

  const selectedRow = rows.find(
    (row) => row.id === selected?.id && row.kind === selected?.kind,
  ) ?? null

  const handleWorldField = useCallback(async (id: number, field: 'title' | 'category', value: string) => {
    try {
      await updateEntry(id, { [field]: value })
      refreshAll()
    } catch {
      toast.error('保存词条失败')
    }
  }, [refreshAll])

  const handleCountryField = useCallback(async (id: number, field: 'name' | 'system', value: string) => {
    try {
      await updateCountry(id, { [field]: value })
      refreshAll()
    } catch {
      toast.error('保存国家失败')
    }
  }, [refreshAll])

  const handleCharacterField = useCallback(
    async (id: number, field: 'name' | 'race' | 'occupation', value: string) => {
      try {
        await updateCharacter(id, { [field]: value })
        refreshAll()
      } catch {
        toast.error('保存角色失败')
      }
    },
    [refreshAll],
  )

  const handleCharacterCountry = useCallback(async (id: number, value: string) => {
    try {
      await updateCharacter(id, { countryId: value ? Number(value) : undefined })
      refreshAll()
    } catch {
      toast.error('更新所属国家失败')
    }
  }, [refreshAll])

  const handleAdd = useCallback(async (asChild: boolean) => {
    if (busy || tab === 'event' || tab === 'custom') return
    setBusy(true)
    try {
      if (tab === 'world') {
        const parentId = asChild && selected?.kind === 'world' ? selected.id ?? null : null
        const id = await createEntry({
          title: parentId ? '新子条目' : '新词条',
          content: '',
          category: 'concept',
          parentId,
          order: entries.filter((entry) => entry.parentId === parentId).length,
          isConcept: false,
          tags: [],
        })
        setTab('world')
        setSelected({ kind: 'world', id })
        if (parentId) setExpanded((prev) => new Set([...prev, `world:${parentId}`]))
        refreshAll()
      } else if (tab === 'country') {
        const parentId = asChild && selected?.kind === 'country' ? selected.id ?? null : null
        const id = await createCountry({
          name: parentId ? '新子国家' : '新国家',
          parentId,
          description: '',
          system: '',
          geography: '',
          culture: '',
          tags: [],
        })
        setSelected({ kind: 'country', id })
        if (parentId) setExpanded((prev) => new Set([...prev, `country:${parentId}`]))
        refreshAll()
      } else {
        const countryId =
          selected?.kind === 'character'
            ? selectedRow?.character?.countryId
            : selected?.kind === 'group'
              ? selected.countryId
              : undefined
        const id = await createCharacter({
          name: '新角色',
          aliases: [],
          race: '',
          element: '',
          occupation: '',
          nationalityLegacy: '',
          countryId,
          height: '',
          birthday: '',
          avatarUrl: '',
          bio: '',
          lifeStory: '',
          relatedCharacters: [],
          gallery: [],
          avatars: [],
          tags: [],
        })
        setSelected({ kind: 'character', id })
        if (countryId) setExpanded((prev) => new Set([...prev, `group:${countryId}`]))
        refreshAll()
      }
      setConfirmDelete(false)
    } catch {
      toast.error('新建条目失败')
    } finally {
      setBusy(false)
    }
  }, [busy, entries, refreshAll, selected, selectedRow, tab])

  const handleDelete = useCallback(async () => {
    if (!selected || selected.id === undefined || selected.kind === 'group') return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      if (selected.kind === 'world') {
        const node = entries.find((entry) => entry.id === selected.id)
        for (const child of entries.filter((entry) => entry.parentId === selected.id)) {
          await updateEntry(child.id as number, { parentId: node?.parentId ?? null })
        }
        await deleteEntry(selected.id)
      } else if (selected.kind === 'country') {
        const node = countries.find((country) => country.id === selected.id)
        for (const child of countries.filter((country) => country.parentId === selected.id)) {
          await updateCountry(child.id as number, { parentId: node?.parentId ?? null })
        }
        await deleteCountry(selected.id)
      } else {
        await deleteCharacter(selected.id)
      }
      setSelected(null)
      setConfirmDelete(false)
      refreshAll()
    } catch {
      toast.error('删除失败')
    } finally {
      setBusy(false)
    }
  }, [confirmDelete, countries, entries, refreshAll, selected])

  useEffect(() => {
    setConfirmDelete(false)
  }, [selected?.id, selected?.kind])

  const totalEntities =
    tab === 'world'
      ? entries.length
      : tab === 'country'
        ? countries.length
        : tab === 'character'
          ? characters.length
          : tab === 'event'
            ? events.length
            : sections.reduce((sum, section) => sum + section.entries.length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-line px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-paper-card text-ink-muted">
            <Table2 size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold text-ink">树形表格</h1>
            <p className="truncate text-[10px] text-ink-faint">
              与百科、关系图谱同源 · 点击单元格直接编辑
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded border border-line bg-paper-alt p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id)
                setSelected(null)
                setSearch('')
              }}
              className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] transition-colors ${
                tab === item.id ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <item.icon size={12} strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <div className="relative w-[220px] shrink-0">
          <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索当前视图..."
            className="h-8 w-full rounded border border-line bg-paper-alt pl-7 pr-2 text-xs text-ink outline-none placeholder:text-ink-faint focus:border-line-hover"
          />
        </div>
        <span className="hidden text-[10px] text-ink-faint md:inline">
          {totalEntities} 个
          {tab === 'world'
            ? '词条'
            : tab === 'country'
              ? '国家'
              : tab === 'character'
                ? '角色'
                : tab === 'event'
                  ? '事件'
                  : '分类条目'}{' '}
          · {tab === 'event' ? events.length : tab === 'custom' ? totalEntities : rows.length} 行可见
        </span>
        <div className="flex-1" />
        <button
          onClick={() => {
            refreshEntries()
            refreshCountries()
            refreshCharacters()
            refreshEvents()
            window.dispatchEvent(new Event('data-updated'))
          }}
          title="刷新树形表格"
          className="flex h-7 items-center gap-1 rounded px-2 text-[10px] text-ink-muted transition-colors hover:bg-paper-card hover:text-ink"
        >
          <RefreshCw size={12} strokeWidth={2} />
          刷新
        </button>
        <button
          onClick={expandAll}
          className="flex h-7 items-center gap-1 rounded px-2 text-[10px] text-ink-muted transition-colors hover:bg-paper-card hover:text-ink"
        >
          <ChevronDown size={12} strokeWidth={2} />
          展开全部
        </button>
        <button
          onClick={collapseAll}
          className="flex h-7 items-center gap-1 rounded px-2 text-[10px] text-ink-muted transition-colors hover:bg-paper-card hover:text-ink"
        >
          <ChevronRight size={12} strokeWidth={2} />
          折叠全部
        </button>
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={() => void handleAdd(false)}
          disabled={busy || tab === 'event' || tab === 'custom'}
          className="flex h-7 items-center gap-1 rounded border border-line px-2 text-[10px] text-ink transition-colors hover:border-line-hover disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={2} />
          新增
        </button>
        <button
          onClick={() => void handleAdd(true)}
          disabled={busy || tab === 'event' || tab === 'custom' || !selected || (tab === 'character' && !selected.countryId && selected.kind !== 'character')}
          className="flex h-7 items-center gap-1 rounded border border-line px-2 text-[10px] text-ink transition-colors hover:border-line-hover disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={2} />
          新增子项
        </button>
        <button
          onClick={() => void handleDelete()}
          disabled={busy || tab === 'event' || tab === 'custom' || !selected || selected.kind === 'group' || selected.id === undefined}
          className={`flex h-7 items-center gap-1 rounded border px-2 text-[10px] transition-colors disabled:opacity-40 ${
            confirmDelete
              ? 'border-error bg-error/10 text-error'
              : 'border-line text-ink-muted hover:border-line-hover hover:text-error'
          }`}
        >
          <Trash2 size={12} strokeWidth={2} />
          {confirmDelete ? '确认删除' : '删除'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'event' ? (
          <div className="space-y-2 p-4">
            {eventsLoading ? (
              <p className="text-xs text-ink-muted">加载事件…</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-ink-muted">暂无事件</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="rounded-lg border border-line bg-paper-card px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="truncate text-sm font-medium text-ink">{event.title}</span>
                    <span className="shrink-0 text-[10px] text-ink-faint">{event.time}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-ink-muted">
                    {event.location || '未填写地点'} · {event.summary || '暂无摘要'}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === 'custom' ? (
          <div className="space-y-4 p-4">
            {sections.length === 0 ? (
              <p className="text-xs text-ink-muted">暂无自定义分类</p>
            ) : (
              sections.map((section) => (
                <div key={section.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Shapes size={12} strokeWidth={2} className="text-ink-faint" />
                    <span className="text-xs font-medium text-ink">{section.name}</span>
                    <span className="text-[10px] text-ink-faint">{section.entries.length} 条</span>
                  </div>
                  <div className="space-y-2">
                    {section.entries.length === 0 ? (
                      <p className="text-[11px] text-ink-faint">暂无条目</p>
                    ) : (
                      section.entries.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-line bg-paper-card px-4 py-2.5">
                          <span className="text-sm text-ink">{entry.name}</span>
                          {entry.note ? (
                            <p className="mt-0.5 truncate text-[11px] text-ink-muted">{entry.note}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
        <table className="w-full min-w-[780px] table-fixed border-collapse text-xs">
          <colgroup>
            {tab === 'world' ? (
              <>
                <col className="w-[38%]" />
                <col className="w-[18%]" />
                <col className="w-[26%]" />
                <col className="w-[18%]" />
              </>
            ) : tab === 'country' ? (
              <>
                <col className="w-[36%]" />
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
              </>
            ) : (
              <>
                <col className="w-[26%]" />
                <col className="w-[13%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
              </>
            )}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-paper/95 backdrop-blur">
            <tr className="border-b border-line text-left text-[10px] font-medium uppercase tracking-wider text-ink-faint">
              <th className="h-8 px-3 font-medium">{tab === 'character' ? '角色 / 国家' : '名称'}</th>
              {tab === 'world' ? <th className="h-8 px-2 font-medium">分类</th> : null}
              {tab === 'country' ? <th className="h-8 px-2 font-medium">体制</th> : null}
              {tab === 'character' ? <th className="h-8 px-2 font-medium">种族</th> : null}
              {tab === 'character' ? <th className="h-8 px-2 font-medium">职业</th> : null}
              {tab === 'character' ? <th className="h-8 px-2 font-medium">所属国家</th> : null}
              <th className="h-8 px-2 font-medium">标签</th>
              <th className="h-8 px-2 font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected?.kind === row.kind && selected.id === row.id
              return (
                <tr
                  key={row.key}
                  onClick={() => {
                    if (row.kind === 'group') {
                      setSelected({ kind: 'group', id: row.countryId, countryId: row.countryId })
                    } else {
                      setSelected({ kind: row.kind, id: row.id, countryId: row.countryId })
                    }
                  }}
                  className={`border-b border-line/60 transition-colors ${
                    isSelected ? 'bg-paper-card' : 'hover:bg-paper-card/40'
                  }`}
                >
                  <td className="h-8 px-3">
                    <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: row.depth * 18 }}>
                      {row.hasChildren ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            toggle(row.key)
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-paper-alt hover:text-ink"
                        >
                          {row.expanded ? (
                            <ChevronDown size={13} strokeWidth={2} />
                          ) : (
                            <ChevronRight size={13} strokeWidth={2} />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <span className="mr-1 shrink-0 text-ink-faint">
                        {row.kind === 'world' ? (
                          <BookOpen size={12} strokeWidth={2} />
                        ) : row.kind === 'country' || row.kind === 'group' ? (
                          <Flag size={12} strokeWidth={2} />
                        ) : (
                          <Users size={12} strokeWidth={2} />
                        )}
                      </span>
                      {row.kind === 'group' ? (
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                          {row.label}
                          <span className="ml-1.5 font-mono text-[9px] text-ink-faint">{row.childCount}</span>
                        </span>
                      ) : row.kind === 'world' && row.entry ? (
                        <EditableCell
                          value={row.entry.title}
                          onCommit={(value) => handleWorldField(row.entry!.id as number, 'title', value)}
                        />
                      ) : row.kind === 'country' && row.country ? (
                        <EditableCell
                          value={row.country.name}
                          onCommit={(value) => handleCountryField(row.country!.id as number, 'name', value)}
                        />
                      ) : row.character ? (
                        <EditableCell
                          value={row.character.name}
                          onCommit={(value) => handleCharacterField(row.character!.id as number, 'name', value)}
                        />
                      ) : null}
                    </div>
                  </td>

                  {tab === 'world' ? (
                    <td className="h-8 px-2">
                      {row.entry ? (
                        <EditableCell
                          value={row.entry.category}
                          onCommit={(value) => handleWorldField(row.entry!.id as number, 'category', value)}
                        />
                      ) : null}
                    </td>
                  ) : null}

                  {tab === 'country' ? (
                    <td className="h-8 px-2">
                      {row.country ? (
                        <EditableCell
                          value={row.country.system}
                          onCommit={(value) => handleCountryField(row.country!.id as number, 'system', value)}
                        />
                      ) : null}
                    </td>
                  ) : null}

                  {tab === 'character' ? (
                    <>
                      <td className="h-8 px-2">
                        {row.character ? (
                          <EditableCell
                            value={row.character.race}
                            onCommit={(value) => handleCharacterField(row.character!.id as number, 'race', value)}
                          />
                        ) : null}
                      </td>
                      <td className="h-8 px-2">
                        {row.character ? (
                          <EditableCell
                            value={row.character.occupation}
                            onCommit={(value) => handleCharacterField(row.character!.id as number, 'occupation', value)}
                          />
                        ) : null}
                      </td>
                      <td className="h-8 px-2">
                        {row.character ? (
                          <select
                            value={row.character.countryId ?? ''}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => void handleCharacterCountry(row.character!.id as number, event.target.value)}
                            className="h-7 w-full rounded-sm border border-transparent bg-transparent px-1 text-xs text-ink-muted outline-none hover:border-line focus:border-line-hover"
                          >
                            <option value="">未归属</option>
                            {countries.map((country) => (
                              <option key={country.id} value={country.id}>
                                {country.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </td>
                    </>
                  ) : null}

                  <td className="h-8 px-2">
                    {row.kind === 'world' && row.entry ? (
                      <TagChips ids={row.entry.tags ?? []} tags={tags} />
                    ) : row.kind === 'country' && row.country ? (
                      <TagChips ids={row.country.tags ?? []} tags={tags} />
                    ) : row.character ? (
                      <TagChips ids={row.character.tags ?? []} tags={tags} />
                    ) : (
                      <span className="text-[10px] text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="h-8 px-2 font-mono text-[10px] text-ink-faint">
                    {row.entry
                      ? formatDate(row.entry.updatedAt)
                      : row.country
                        ? formatDate(row.country.updatedAt)
                        : row.character
                          ? formatDate(row.character.updatedAt)
                          : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        )}
        {tab !== 'event' && tab !== 'custom' && rows.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <Table2 size={20} strokeWidth={2} className="text-ink-faint" />
            <p className="text-xs text-ink-muted">
              {query ? '没有匹配的条目' : '暂无数据，使用“新增”创建第一条'}
            </p>
          </div>
        ) : null}
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4 text-[10px] text-ink-faint">
        <span>点击名称 / 分类 / 体制 / 种族 / 职业单元格可直接编辑；Enter 保存，Esc 取消。</span>
        <span className="font-mono">
          {tab === 'world' ? 'worldEntries' : tab === 'country' ? 'countries' : 'characters'} · Dexie
        </span>
      </footer>
    </div>
  )
}
