'use client'

import { useState, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Country } from '@/types'
import { stripHtml } from '@/lib/utils'
import { extractCountryPreview } from '@/lib/document-utils'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Separator } from '@/components/ui/separator'
import { useCountryList } from '../hooks/useCountries'
import { SortViewControls } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-countries-view') as ViewMode) ?? 'grid'
}

function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-countries-view', mode)
  }
}

type CountrySortKey = 'name' | 'updatedAt' | 'createdAt'

function sortCountryList(countries: Country[], key: CountrySortKey): Country[] {
  return [...countries].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hans')
    if (key === 'updatedAt') return b.updatedAt - a.updatedAt
    return b.createdAt - a.createdAt
  })
}

const COUNTRY_SORT_OPTIONS: SortOption[] = [
  { label: '按名称', value: 'name' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

function CountryRow({
  country,
  onSelect,
  onDelete,
}: {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(country.id as number)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(country.id as number)}
      onKeyDown={handleKeyDown}
      className="flex w-full cursor-pointer items-center gap-4 rounded-md px-4 py-3 text-left transition-colors hover:bg-paper-alt"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>
        <div className="flex items-center gap-2">
          {extractCountryPreview(country.document) ?? (country.system ? stripHtml(country.system) : null) ? (
            <span className="text-xs text-ink-muted">{extractCountryPreview(country.document) ?? stripHtml(country.system)}</span>
          ) : null}
          <span className="text-xs text-ink-faint">
            编辑于 {formatRelativeTime(country.updatedAt)}
          </span>
        </div>
      </div>
      <DeleteButton onDelete={() => onDelete(country.id as number)} />
    </div>
  )
}

function CountryCard({
  country,
  onSelect,
  onDelete,
}: {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="relative">
      <button
        onClick={() => onSelect(country.id as number)}
        className="flex w-full flex-col gap-2 rounded-md border border-line bg-paper-card p-4 text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>

        <div className="flex flex-wrap gap-1.5">
          {extractCountryPreview(country.document) ?? (country.system ? stripHtml(country.system) : null) ? (
            <span className="inline-flex rounded border border-line px-1.5 py-0.5 text-xs text-ink-muted">
              {extractCountryPreview(country.document) ?? stripHtml(country.system)}
            </span>
          ) : null}
        </div>

        <span className="mt-auto text-xs text-ink-faint">
          编辑于 {formatRelativeTime(country.updatedAt)}
        </span>
      </button>

      <div className="absolute right-3 top-3 z-10">
        <DeleteButton onDelete={() => onDelete(country.id as number)} />
      </div>
    </div>
  )
}

interface CountryListProps {
  onSelectCountry: (id: number) => void
  onCreateCountry: () => void
  onDeleteCountry: (id: number) => void
}

export function CountryList({
  onSelectCountry,
  onCreateCountry,
  onDeleteCountry,
}: CountryListProps) {
  const { countries, loading, error } = useCountryList()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<CountrySortKey>('updatedAt')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)

  const filtered = useMemo(() => {
    let result = countries
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.system.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.geography.toLowerCase().includes(q),
      )
    }
    return sortCountryList(result, sortKey)
  }, [countries, sortKey, search])

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
          onClick={onCreateCountry}
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
          <h2 className="text-lg text-ink">国家</h2>
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
              placeholder="搜索国家..."
              className="h-9 w-48 rounded border border-line bg-paper-card pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
            />
          </div>
          <Separator orientation="vertical" className="h-4 !self-center" />
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => setSortKey(key as CountrySortKey)}
            sortOptions={COUNTRY_SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
          />
        </div>
        <button
          onClick={onCreateCountry}
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-alt px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建国家</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {countries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button
              onClick={onCreateCountry}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无国家，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((country) => (
              <CountryCard
                key={country.id}
                country={country}
                onSelect={onSelectCountry}
                onDelete={onDeleteCountry}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filtered.map((country) => (
              <CountryRow
                key={country.id}
                country={country}
                onSelect={onSelectCountry}
                onDelete={onDeleteCountry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
