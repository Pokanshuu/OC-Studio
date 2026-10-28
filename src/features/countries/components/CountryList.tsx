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
import { useCountryList, useReorderCountries } from '../hooks/useCountries'
import { useDevice } from '@/lib/use-device'
import { MobileFab } from '@/components/layout/MobileFab'
import { CountryCard, CountryRow } from './CountryListItems'
import { CountryListToolbar } from './CountryListToolbar'
import { readViewPreference, writeViewPreference, sortCountryList, SORT_STORAGE_KEY } from './country-list-utils'
import type { CountrySortKey } from './country-list-utils'
import { readSortKey, writeSortKey } from '@/lib/sort-manual'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { BTN_QUIET, CENTER_STATE, EMPTY_HINT, LIST_GRID } from '@/lib/ui-tokens'

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
  const [sortKey, setSortKey] = useState<CountrySortKey>(() => readSortKey(SORT_STORAGE_KEY, 'updatedAt'))
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

  const handleSortChange = (key: CountrySortKey) => {
    setSortKey(key)
    writeSortKey(SORT_STORAGE_KEY, key)
  }

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    writeViewPreference(mode)
  }

  const manual = sortKey === 'manual'
  const reorderCountries = useReorderCountries()

  const handleReorder = useCallback(
    (activeId: number | string, overId: number | string) => {
      const base = sortCountryList(countries, 'manual').map((c) => c.id)
      void reorderCountries(moveId(base, Number(activeId), Number(overId)))
    },
    [countries, reorderCountries],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onCreateCountry}
          className={BTN_QUIET}
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
        onSortKeyChange={handleSortChange}
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
              className={EMPTY_HINT}
            >
              暂无国家，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <SortableList
            ids={filtered.map((c) => c.id)}
            onReorder={handleReorder}
            layout="grid"
            disabled={!manual}
          >
            <div className={LIST_GRID}>
              {filtered.map((country) => (
                <div key={country.id} className="[break-inside:avoid] mb-4">
                  <CountryCard
                    country={country}
                    onSelect={handleSelect}
                    onDelete={onDeleteCountry}
                    onLongPress={() => openActionSheet(country)}
                    isMobile={isMobile}
                    sortable={manual}
                  />
                </div>
              ))}
            </div>
          </SortableList>
        ) : (
          <SortableList
            ids={filtered.map((c) => c.id)}
            onReorder={handleReorder}
            layout="list"
            disabled={!manual}
          >
            <div className="flex flex-col rules-end">
              {filtered.map((country) => (
                <CountryRow
                  key={country.id}
                  country={country}
                  onSelect={handleSelect}
                  onDelete={onDeleteCountry}
                  onLongPress={() => openActionSheet(country)}
                  isMobile={isMobile}
                  sortable={manual}
                />
              ))}
            </div>
          </SortableList>
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
