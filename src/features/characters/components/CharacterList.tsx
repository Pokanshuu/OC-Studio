'use client'

import { useState, useMemo, useCallback } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { Pencil, Trash2 } from 'lucide-react'
import type { Character } from '@/types'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useDevice } from '@/lib/use-device'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { MobileFab } from '@/components/layout/MobileFab'
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
import { CharacterCard, CharacterRow } from './CharacterListItems'
import { CharacterListToolbar } from './CharacterListToolbar'
import type { CountryOption } from './CountryFilterSelect'
import {
  readViewPreference,
  writeViewPreference,
  sortCharacters,
  aliasesMatch,
} from './character-list-utils'
import type { SortKey } from './character-list-utils'
import type { ViewMode } from '@/components/shared/SortViewControls'

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
  const { isMobile } = useDevice()
  const handleSelect = useMemo(() => withTouchFeedback(onSelectCharacter), [onSelectCharacter])
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<number | 'all'>('all')
  const { countries } = useCountryList()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const openActionSheet = useCallback((char: Character) => {
    setActionSheet({
      open: true,
      title: char.name,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectCharacter(char.id) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(char.id) },
      ],
    })
  }, [onSelectCharacter])

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
        .map((c) => ({ value: c.id, label: c.name })),
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
        <span className="text-[13px] text-ink-faint">加载中…</span>
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
    <div className="flex flex-col min-h-full">
      <CharacterListToolbar
        search={search}
        onSearchChange={setSearch}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
        countryOptions={countryOptions}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        viewMode={viewMode}
        onViewModeChange={handleViewChange}
        onCreateCharacter={onCreateCharacter}
      />

      <div className="max-md:h-10 flex-shrink-0" />

      <div className="flex-1 p-4 flex flex-col">
        {characters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onCreateCharacter}
              className="font-serif text-sm text-ink-faint transition-colors hover:text-ink"
            >
              暂无角色，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((character) => (
              <div key={character.id} className="[break-inside:avoid] mb-4">
                <CharacterCard
                  character={character}
                  onSelect={handleSelect}
                  onDelete={onDeleteCharacter}
                  onLongPress={() => openActionSheet(character)}
                  countryName={getCountryName(character)}
                  isMobile={isMobile}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filtered.map((character) => (
              <CharacterRow
                key={character.id}
                character={character}
                onSelect={handleSelect}
                onDelete={onDeleteCharacter}
                onLongPress={() => openActionSheet(character)}
                countryName={getCountryName(character)}
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
                onDeleteCharacter(deleteTarget)
                setDeleteTarget(null)
              }
            }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

