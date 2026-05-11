'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Plus,
  Search,
  ChevronDown,
} from 'lucide-react'
import type { Character } from '@/types'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Separator } from '@/components/ui/separator'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { SortViewControls } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'

type SortKey = 'name' | 'updatedAt' | 'createdAt'

const SORT_OPTIONS: SortOption[] = [
  { label: '按名称', value: 'name' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-characters-view') as ViewMode) ?? 'grid'
}

function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-characters-view', mode)
  }
}

interface CountryOption {
  value: number | 'all'
  label: string
}

function CountryFilterSelect({
  value,
  onChange,
  options,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: CountryOption[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '全部国家'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1 rounded border border-line bg-paper-card px-3 text-sm text-ink transition-colors hover:border-line-hover"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-[1] mt-1 flex max-h-64 flex-col overflow-auto rounded-md border border-line bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                value === opt.value
                  ? 'bg-paper-card text-ink'
                  : 'text-ink hover:bg-paper-alt'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function sortCharacters(characters: Character[], key: SortKey): Character[] {
  return [...characters].sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name, 'zh-Hans')
    }
    if (key === 'updatedAt') {
      return b.updatedAt - a.updatedAt
    }
    return b.createdAt - a.createdAt
  })
}

function aliasesText(aliases: string[]): string {
  if (!Array.isArray(aliases)) return (aliases as unknown as string) || ''
  return aliases.join('、')
}

function aliasesMatch(aliases: string[], q: string): boolean {
  if (!Array.isArray(aliases)) return ((aliases as unknown as string) || '').toLowerCase().includes(q)
  return aliases.some((a) => a.toLowerCase().includes(q))
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function CharacterCard({
  character,
  onSelect,
  onDelete,
  countryName,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  countryName?: string
}) {
  const displayNationality = countryName || character.nationalityLegacy

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(character.id as number)}
        className="flex w-full flex-col gap-2 rounded-md border border-line bg-paper-card p-4 text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        <h3 className="truncate text-sm font-medium text-ink">{character.name}</h3>

        <div className="flex flex-wrap gap-1.5">
          {displayNationality ? (
            <span className="inline-flex rounded border border-line px-1.5 py-0.5 text-xs text-ink-muted">
              {displayNationality}
            </span>
          ) : null}
          {character.race ? (
            <span className="inline-flex rounded border border-line px-1.5 py-0.5 text-xs text-ink-muted">
              {character.race}
            </span>
          ) : null}
        </div>

        <span className="mt-auto text-xs text-ink-faint">
          编辑于 {formatRelativeTime(character.updatedAt)}
        </span>
      </button>

      <div className="absolute right-3 top-3">
        <DeleteButton onDelete={() => onDelete(character.id as number)} />
      </div>
    </div>
  )
}

function CharacterRow({
  character,
  onSelect,
  onDelete,
  countryName,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  countryName?: string
}) {
  const displayNationality = countryName || character.nationalityLegacy

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(character.id as number)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(character.id as number)}
      onKeyDown={handleKeyDown}
      className="flex w-full cursor-pointer items-center gap-4 rounded-md px-4 py-3 text-left transition-colors hover:bg-paper-alt"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-ink">{character.name}</h3>
          {character.aliases.length > 0 ? (
            <span className="shrink-0 text-xs text-ink-faint">
              ({aliasesText(character.aliases)})
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {displayNationality ? (
            <span className="text-xs text-ink-muted">{displayNationality}</span>
          ) : null}
          {character.race ? (
            <span className="text-xs text-ink-muted">{character.race}</span>
          ) : null}
          <span className="text-xs text-ink-faint">
            编辑于 {formatRelativeTime(character.updatedAt)}
          </span>
        </div>
      </div>
      <DeleteButton onDelete={() => onDelete(character.id as number)} />
    </div>
  )
}

interface CharacterListProps {
  characters: Character[]
  loading: boolean
  error: string | null
  onSelectCharacter: (id: number) => void
  onCreateCharacter: () => void
  onDeleteCharacter: (id: number) => void
}

export function CharacterList({
  characters,
  loading,
  error,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
}: CharacterListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<number | 'all'>('all')
  const { countries } = useCountryList()

  const countryMap = useMemo(() => {
    const map: Record<number, string> = {}
    for (const c of countries) {
      if (c.id !== undefined) {
        map[c.id] = c.name
      }
    }
    return map
  }, [countries])

  const countryOptions = useMemo<CountryOption[]>(() => {
    return [
      { value: 'all', label: '全部国家' },
      ...countries
        .filter((c) => c.id !== undefined)
        .map((c) => ({ value: c.id as number, label: c.name })),
    ]
  }, [countries])

  const getCountryName = useCallback(
    (character: Character): string | undefined => {
      if (character.countryId !== undefined) {
        return countryMap[character.countryId]
      }
      return undefined
    },
    [countryMap],
  )

  const filtered = useMemo(() => {
    let result = characters
    if (countryFilter !== 'all') {
      result = result.filter((c) => c.countryId === countryFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          aliasesMatch(c.aliases, q) ||
          c.race?.toLowerCase().includes(q) ||
          c.nationalityLegacy?.toLowerCase().includes(q),
      )
    }
    return sortCharacters(result, sortKey)
  }, [characters, sortKey, search, countryFilter])

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    writeViewPreference(mode)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-ink-muted">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onCreateCharacter}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-3 min-h-[60px]">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink">角色</h2>
          <Separator orientation="vertical" className="h-4 !self-center" />
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索角色..."
              className="h-9 w-48 rounded border border-line bg-paper-card pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
            />
          </div>
          <Separator orientation="vertical" className="h-4 !self-center" />
          <CountryFilterSelect
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions}
          />
          <Separator orientation="vertical" className="h-4 !self-center" />
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => setSortKey(key as SortKey)}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
          />
        </div>
        <button
          onClick={onCreateCharacter}
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-alt px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建角色</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {characters.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button
              onClick={onCreateCharacter}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无角色，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onSelect={onSelectCharacter}
                onDelete={onDeleteCharacter}
                countryName={getCountryName(character)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filtered.map((character) => (
              <CharacterRow
                key={character.id}
                character={character}
                onSelect={onSelectCharacter}
                onDelete={onDeleteCharacter}
                countryName={getCountryName(character)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
