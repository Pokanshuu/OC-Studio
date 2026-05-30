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
} from 'lucide-react'
import type { Character } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { Separator } from '@/components/ui/separator'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'
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
        className="touch-feedback flex md:h-9 h-7 items-center gap-1 rounded border border-line bg-paper-card/60 md:px-3 px-2 md:text-sm text-[11px] text-ink transition-colors hover:border-line-hover"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto rounded-md border border-line bg-paper/70 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
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
                  : 'text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
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
  const aliasText = aliasesText(character.aliases)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(character.id as number)}
        className="flex w-full flex-col rounded-md border border-line bg-paper-card overflow-hidden text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        {character.headerUrl ? (
          <div className="relative w-full aspect-[3/2] bg-paper-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageUrl(character.headerUrl, 'header')}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        ) : null}
        <div className={`flex gap-3 p-3 ${displayNationality ? 'items-start' : 'items-center'}`}>
          <Avatar src={character.avatarUrl} size="md" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-1 min-w-0">
              <h3 className="text-sm font-medium text-ink truncate">{character.name}</h3>
              {aliasText ? (
                <span className="shrink-0 text-xs text-ink-muted">({aliasText})</span>
              ) : null}
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
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
      {...longPress}
    >
      <Avatar src={getImageUrl(character.avatarUrl, 'avatar')} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
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
    <div className="flex flex-col min-h-full">
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink font-serif font-bold">角色</h2>
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
              placeholder="搜索角色..."
              className="h-9 w-48 rounded border border-line bg-paper-card/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
            />
          </div>
          <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
          <CountryFilterSelect
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions}
          />
          <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
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
          className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
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
          className="touch-feedback flex h-7 items-center gap-1 rounded border border-line bg-paper-card/60 px-2.5 text-[11px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
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
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无角色，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((character) => (
              <CharacterCard
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
