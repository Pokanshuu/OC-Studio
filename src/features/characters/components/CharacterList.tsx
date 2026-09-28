'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { withTouchFeedback } from '@/lib/animation'
import {
  Plus,
  Search,
  ChevronDown,
  Pencil,
  Trash2,
  Circle,
} from 'lucide-react'
import type { Character } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'
import { PAGE_TITLE } from '@/lib/ui-tokens'
import { useDevice } from '@/lib/use-device'
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
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { MobileFab } from '@/components/layout/MobileFab'

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node
    const overlay = document.getElementById('overlay-root')
    if (triggerRef.current && !triggerRef.current.contains(target)) {
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (overlay && overlay.contains(target)) return
        setOpen(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '全部国家'

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="touch-feedback flex md:h-9 h-7 items-center gap-1 px-2 text-[11px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:px-3 md:text-[13px]"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none pointer-events-auto"
              style={{ left: pos.x, top: pos.y }}
            >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                value === opt.value
                  ? 'bg-black/5 dark:bg-white/5 text-ink'
                  : 'text-ink hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
            </div>,
            document.getElementById('overlay-root')!,
          )
        : null}
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

function CharacterCard({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
}) {
  const displayNationality = countryName || character.nationalityLegacy

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(character.id as number)}
        className="flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line"
      >
        <div className="relative aspect-[3/2] w-full bg-paper-card">
          {character.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(character.headerUrl, 'header')}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* 图片与卡片底色之间做渐变过渡 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint">
              {character.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className={`flex gap-3 p-2.5 ${displayNationality ? 'items-start' : 'items-center'}`}>
          <Avatar src={character.avatarUrl} size="md" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {character.isMajor ? (
                <span title="主要角色" className="shrink-0">
                  <Circle size={8} fill="var(--color-ink-muted)" className="text-ink-muted" />
                </span>
              ) : null}
              <h3 className="text-sm font-medium text-ink truncate">{character.name}</h3>
            </div>
            {displayNationality ? (
              <span className="text-xs text-ink-faint">{displayNationality}</span>
            ) : null}
          </div>
        </div>
      </button>

      {!isMobile ? (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(character.id as number)} />
        </div>
      ) : null}
    </div>
  )
}

function CharacterRow({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
}) {
  const displayNationality = countryName || character.nationalityLegacy
  const aliasText = aliasesText(character.aliases)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

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
      className="group relative flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--oc-hover)]"
      {...longPress}
    >
      <Avatar src={getImageUrl(character.avatarUrl, 'avatar')} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {character.isMajor ? (
            <span title="主要角色" className="shrink-0">
              <Circle size={8} fill="var(--color-ink-muted)" className="text-ink-muted" />
            </span>
          ) : null}
          <h3 className="truncate text-sm font-medium text-ink">{character.name}</h3>
          {aliasText ? (
            <span className="shrink-0 text-xs text-ink-muted">({aliasText})</span>
          ) : null}
        </div>
        <div className="truncate text-xs text-ink-muted">
          {displayNationality ? <span>{displayNationality}</span> : null}
          {displayNationality && character.race ? <span> · </span> : null}
          {character.race ? <span>{character.race}</span> : null}
        </div>
      </div>
      {!isMobile ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(character.id as number)} />
        </div>
      ) : null}
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
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectCharacter(char.id as number) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(char.id as number) },
      ],
    })
  }, [onSelectCharacter, onDeleteCharacter])

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
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 h-12 border-b border-line px-6 bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>角色</h2>
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
              placeholder="搜索角色..."
              className="h-8 w-44 border-b border-transparent bg-transparent pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
            />
          </div>
          <CountryFilterSelect
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions}
          />
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
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建角色</span>
        </button>
      </div>

      <MobileFilterBar>
        <div className="flex items-center gap-2">
          <CountryFilterSelect
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions}
          />
          <SortSelect
            sortKey={sortKey}
            onChange={(key) => setSortKey(key as SortKey)}
            options={SORT_OPTIONS}
          />
        </div>
        <button
          onClick={onCreateCharacter}
          className="touch-feedback flex items-center gap-1 bg-paper/85 px-2 py-1 text-[11px] text-ink-muted backdrop-blur transition-colors hover:text-ink"
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>

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
