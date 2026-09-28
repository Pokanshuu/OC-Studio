'use client'

import { useState, useMemo, useCallback } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import type { Country } from '@/types'
import { stripHtml } from '@/lib/utils'
import { extractCountryPreview } from '@/lib/document-utils'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { useCountryList } from '../hooks/useCountries'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'
import { PAGE_TITLE } from '@/lib/ui-tokens'
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
  onLongPress,
  isMobile,
}: {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
}) {
  const preview = extractCountryPreview(country.document) ?? stripHtml(country.system ?? '')

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

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
      className="group relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]"
      {...longPress}
    >
      <Avatar src={getImageUrl(country.flagUrl, 'flag')} size="md" type="flag" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>
        {preview ? (
          <span className="text-xs text-ink-muted truncate">{preview}</span>
        ) : null}
      </div>
      {!isMobile ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(country.id as number)} />
        </div>
      ) : null}
    </div>
  )
}

function CountryCard({
  country,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
}: {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
}) {
  const preview = extractCountryPreview(country.document) ?? stripHtml(country.system ?? '')

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(country.id as number)}
        className="flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line"
      >
        <div className="relative aspect-[3/2] w-full bg-paper-card">
          {country.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(country.headerUrl, 'header')}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint">
              {country.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 p-2.5">
          <Avatar src={country.flagUrl} size="md" type="flag" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <h3 className="text-sm font-medium text-ink truncate">{country.name}</h3>
            {preview ? (
              <p className="text-xs text-ink-muted truncate">{preview}</p>
            ) : null}
          </div>
        </div>
      </button>

      {!isMobile ? (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(country.id as number)} />
        </div>
      ) : null}
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
  const handleSelect = useMemo(() => withTouchFeedback(onSelectCountry), [onSelectCountry])
  const { countries, loading, error } = useCountryList()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<CountrySortKey>('updatedAt')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const openActionSheet = useCallback((c: Country) => {
    setActionSheet({
      open: true,
      title: c.name,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectCountry(c.id as number) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(c.id as number) },
      ],
    })
  }, [onSelectCountry, onDeleteCountry])

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
        <span className="text-[13px] text-ink-faint">加载中…</span>
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
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 h-12 border-b border-line px-6 bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>国家</h2>
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
              className="h-8 w-44 border-b border-transparent bg-transparent pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
            />
          </div>
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
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85"
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
          className="touch-feedback flex items-center gap-1 bg-paper/85 px-2 py-1 text-[11px] text-ink-muted backdrop-blur transition-colors hover:text-ink"
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
              className="font-serif text-sm text-ink-faint transition-colors hover:text-ink"
            >
              暂无国家，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((country) => (
              <div key={country.id} className="[break-inside:avoid] mb-4">
                <CountryCard
                  country={country}
                  onSelect={handleSelect}
                  onDelete={onDeleteCountry}
                  onLongPress={() => openActionSheet(country)}
                  isMobile={isMobile}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filtered.map((country) => (
              <CountryRow
                key={country.id}
                country={country}
                onSelect={handleSelect}
                onDelete={onDeleteCountry}
                onLongPress={() => openActionSheet(country)}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
        <MobileFab viewMode={viewMode} onViewModeChange={handleViewChange} />
      </div>

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((prev) => ({ ...prev, open: false }))}
        title={actionSheet.title}
        actions={actionSheet.actions}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将移至回收站，可在 30 天内恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteTarget !== null) {
                onDeleteCountry(deleteTarget)
                setDeleteTarget(null)
              }
            }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
