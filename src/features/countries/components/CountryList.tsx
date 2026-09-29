'use client'

import { useState, useMemo, useCallback } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { Pencil, Trash2 } from 'lucide-react'
import type { Country } from '@/types'
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
import { useCountryList } from '../hooks/useCountries'
import { useDevice } from '@/lib/use-device'
import { MobileFab } from '@/components/layout/MobileFab'
import { CountryCard, CountryRow } from './CountryListItems'
import { CountryListToolbar } from './CountryListToolbar'
import { readViewPreference, writeViewPreference, sortCountryList } from './country-list-utils'
import type { CountrySortKey } from './country-list-utils'
import type { ViewMode } from '@/components/shared/SortViewControls'

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
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectCountry(c.id) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(c.id) },
      ],
    })
  }, [onSelectCountry])

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
      <CountryListToolbar
        search={search}
        onSearchChange={setSearch}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        viewMode={viewMode}
        onViewModeChange={handleViewChange}
        onCreateCountry={onCreateCountry}
      />

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
