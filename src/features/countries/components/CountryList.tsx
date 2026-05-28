'use client'

import { useState, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Country } from '@/types'
import { stripHtml } from '@/lib/utils'
import { extractCountryPreview } from '@/lib/document-utils'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { Separator } from '@/components/ui/separator'
import { useCountryList } from '../hooks/useCountries'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'
import { useDevice } from '@/lib/use-device'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { MobileFab } from '@/components/layout/MobileFab'

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
  const preview = extractCountryPreview(country.document) ?? stripHtml(country.system ?? '')

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
      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
    >
      <Avatar src={getImageUrl(country.flagUrl, 'flag')} size="md" type="flag" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>
        {preview ? (
          <span className="text-xs text-ink-muted truncate">{preview}</span>
        ) : null}
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
  const preview = extractCountryPreview(country.document) ?? stripHtml(country.system ?? '')

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(country.id as number)}
        className="flex w-full flex-col rounded-md border border-line bg-paper-card overflow-hidden text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        {country.headerUrl ? (
          <div className="relative w-full aspect-[3/2] bg-paper-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageUrl(country.headerUrl, 'header')}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        ) : null}
        <div className="flex items-start gap-3 p-3">
          <Avatar src={country.flagUrl} size="md" type="flag" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <h3 className="text-sm font-medium text-ink truncate">{country.name}</h3>
            {preview ? (
              <p className="text-xs text-ink-muted truncate">{preview}</p>
            ) : null}
          </div>
        </div>
      </button>

      <div className="absolute right-2 top-2">
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
  const { isMobile } = useDevice()
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
    <div className="flex flex-col min-h-full">
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink font-serif font-bold">国家</h2>
          <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
          <div className="relative max-md:hidden md:block">
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
              className="h-9 w-48 rounded border border-line bg-paper-card/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
            />
          </div>
          <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
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
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建国家</span>
        </button>
      </div>

      <MobileFilterBar>
        <SortSelect
          sortKey={sortKey}
          onChange={(key) => setSortKey(key as CountrySortKey)}
          options={COUNTRY_SORT_OPTIONS}
        />
        <button
          onClick={onCreateCountry}
          className="flex h-7 items-center gap-1 rounded border border-line bg-paper-card/60 px-2.5 text-[11px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>

      <div className="max-md:h-10 flex-shrink-0" />

      <div className="flex-1 p-4 flex flex-col">
        {countries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onCreateCountry}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无国家，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
        <MobileFab viewMode={viewMode} onViewModeChange={handleViewChange} />
      </div>
    </div>
  )
}
