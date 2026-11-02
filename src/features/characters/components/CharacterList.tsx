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
  GripVertical,
  Folder,
  FolderPlus,
  FolderInput,
  MoreHorizontal,
} from 'lucide-react'
import type { Character, CharacterKind } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { resolveAccentColor } from '@/lib/entity-accent'
import { Separator } from '@/components/ui/separator'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'
import { useDevice } from '@/lib/use-device'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import {
  useCharacterFolders,
  moveCharactersToFolder,
  type CharacterFolder,
} from '../folders'

type SortKey = 'name' | 'updatedAt' | 'createdAt' | 'manual'

const SORT_OPTIONS: SortOption[] = [
  { label: '按名称', value: 'name' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
  { label: '手动排序', value: 'manual' },
]

const MANUAL_ORDER_KEY = 'oc-character-manual-order'

function readManualOrder(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MANUAL_ORDER_KEY)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

function writeManualOrder(order: number[]): void {
  window.localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(order))
}

function startPointerReorder(
  event: React.PointerEvent<HTMLElement>,
  fromId: number,
  onReorder?: (fromId: number, toId: number) => void,
): void {
  if (!onReorder) return
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startY = event.clientY
  const getTarget = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y)
    const card = element?.closest<HTMLElement>('[data-character-id]')
    const id = Number(card?.dataset.characterId)
    return Number.isFinite(id) && id > 0 ? id : null
  }
  const up = (upEvent: PointerEvent): void => {
    const moved = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) > 4
    const target = moved ? getTarget(upEvent.clientX, upEvent.clientY) : null
    if (target && target !== fromId) onReorder(fromId, target)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}

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
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto rounded-md border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
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

function sortCharacters(characters: Character[], key: SortKey, manualOrder: number[]): Character[] {
  if (key === 'manual') {
    const byId = new Map(characters.map((character) => [character.id, character]))
    const ordered = manualOrder
      .map((id) => byId.get(id))
      .filter((character): character is Character => Boolean(character))
    const remaining = characters.filter((character) => !manualOrder.includes(character.id as number))
    return [...ordered, ...remaining]
  }
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

function SortableCharacter({
  id,
  className,
  children,
}: {
  id: number
  className?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={className}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
        zIndex: isDragging ? 30 : undefined,
        position: 'relative',
      }}
    >
      {children}
    </div>
  )
}

function CharacterCard({
  character,
  onSelect,
  onDelete,
  onMove,
  onLongPress,
  countryName,
  isMobile,
  onReorder,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onMove?: () => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
  onReorder?: (fromId: number, toId: number) => void
}) {
  const displayNationality = countryName || character.nationalityLegacy
  const accent = resolveAccentColor(character.accentColor, character.name)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div
      data-character-id={character.id}
      className="relative group touch-feedback"
      {...longPress}
    >
      <span
        onClick={(event) => event.stopPropagation()}
        style={{ touchAction: 'none' }}
        className="absolute left-1 top-2 z-20 flex h-6 w-4 cursor-grab items-center justify-center rounded text-ink-faint opacity-0 transition-all hover:scale-125 hover:text-ink group-hover:opacity-100 active:scale-95"
        title="拖动调整位置"
      >
        <GripVertical size={13} strokeWidth={2} />
      </span>
      <button
        onClick={() => onSelect(character.id as number)}
        style={{ borderColor: `${accent}35` }}
        className="flex w-full flex-col rounded-md border bg-paper-card overflow-hidden text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
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
            </div>
            {displayNationality ? (
              <span className="text-xs text-ink-faint">{displayNationality}</span>
            ) : null}
          </div>
        </div>
      </button>

      {!isMobile ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onMove ? (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onMove()
              }}
              title="移动到文件夹"
              className="flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
            >
              <FolderInput size={13} strokeWidth={2} />
            </button>
          ) : null}
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
  onMove,
  onLongPress,
  countryName,
  isMobile,
  onReorder,
}: {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onMove?: () => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
  onReorder?: (fromId: number, toId: number) => void
}) {
  const displayNationality = countryName || character.nationalityLegacy
  const aliasText = aliasesText(character.aliases)
  const accent = resolveAccentColor(character.accentColor, character.name)

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
      data-character-id={character.id}
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
      {...longPress}
    >
      <span
        onClick={(event) => event.stopPropagation()}
        style={{ touchAction: 'none' }}
        className="absolute left-0 top-2 z-20 flex h-6 w-4 cursor-grab items-center justify-center rounded text-ink-faint opacity-0 transition-all hover:scale-125 hover:text-ink group-hover:opacity-100 active:scale-95"
        title="拖动调整位置"
      >
        <GripVertical size={13} strokeWidth={2} />
      </span>
      <span
        className="absolute bottom-2 left-2 top-2 w-0.5 rounded-full"
        style={{ backgroundColor: accent }}
      />
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
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onMove ? (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onMove()
              }}
              title="移动到文件夹"
              className="flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
            >
              <FolderInput size={13} strokeWidth={2} />
            </button>
          ) : null}
          <DeleteButton onDelete={() => onDelete(character.id as number)} />
        </div>
      ) : null}
    </div>
  )
}

interface CharacterListProps {
  characters: Character[]
  kind?: CharacterKind
  loading: boolean
  error: string | null
  onSelectCharacter: (id: number) => void
  onCreateCharacter: (folderId?: string | null) => void
  onDeleteCharacter: (id: number) => void
}

export function CharacterList({
  characters,
  kind = 'character',
  loading,
  error,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
}: CharacterListProps) {
  const { isMobile } = useDevice()
  const kindLabel = kind === 'weapon' ? '武器' : kind === 'pet' ? '宠物' : '角色'
  const kindCharacters = useMemo(
    () => characters.filter((character) => (character.entityKind ?? 'character') === kind),
    [characters, kind],
  )
  const { folders, createFolder, renameFolder, deleteFolder } = useCharacterFolders()
  const [activeFolder, setActiveFolder] = useState<'all' | 'none' | string>('all')
  const [folderDialog, setFolderDialog] = useState<{
    mode: 'create' | 'rename'
    id?: string
    value: string
  } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<CharacterFolder | null>(null)
  const [moveTarget, setMoveTarget] = useState<Character | null>(null)
  const handleSelect = useMemo(() => withTouchFeedback(onSelectCharacter), [onSelectCharacter])
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'updatedAt'
    return (localStorage.getItem('oc-characters-sort') as SortKey) ?? 'updatedAt'
  })
  const [manualOrder, setManualOrder] = useState<number[]>(readManualOrder)
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
        { id: 'move', label: '移动到文件夹', icon: <FolderInput size={20} strokeWidth={2} />, onPress: () => setMoveTarget(char) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(char.id as number) },
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
    const knownFolderIds = new Set(folders.map((folder) => folder.id))
    let result = kindCharacters
    if (activeFolder === 'none') {
      result = result.filter((c) => !c.folderId || !knownFolderIds.has(c.folderId))
    } else if (activeFolder !== 'all') {
      result = result.filter((c) => c.folderId === activeFolder)
    }
    if (kind === 'character' && countryFilter !== 'all') {
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
    return sortCharacters(result, sortKey, manualOrder)
  }, [kindCharacters, sortKey, manualOrder, search, countryFilter, activeFolder, folders])

  const folderCounts = useMemo(() => {
    const knownFolderIds = new Set(folders.map((folder) => folder.id))
    const counts: Record<string, number> = {}
    let uncategorized = 0
    for (const character of kindCharacters) {
      if (character.folderId && knownFolderIds.has(character.folderId)) {
        counts[character.folderId] = (counts[character.folderId] ?? 0) + 1
      } else {
        uncategorized += 1
      }
    }
    return { counts, uncategorized }
  }, [kindCharacters, folders])

  const reorderCharacter = useCallback((fromId: number, toId: number) => {
    setManualOrder((current) => {
      const ids = current.length > 0
        ? [...current]
        : kindCharacters.map((character) => character.id as number)
      const fromIndex = ids.indexOf(fromId)
      const toIndex = ids.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0) return current
      ids.splice(fromIndex, 1)
      ids.splice(toIndex, 0, fromId)
      writeManualOrder(ids)
      return ids
    })
    setSortKey('manual')
    localStorage.setItem('oc-characters-sort', 'manual')
  }, [kindCharacters])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const handleCharacterDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = Number(event.active.id)
      const overId = event.over ? Number(event.over.id) : null
      if (!overId || activeId === overId) return
      reorderCharacter(activeId, overId)
    },
    [reorderCharacter],
  )

  const handleSortChange = (value: string) => {
    setSortKey(value as SortKey)
    localStorage.setItem('oc-characters-sort', value)
  }

  const submitFolderDialog = (): void => {
    if (!folderDialog) return
    const name = folderDialog.value.trim()
    if (!name) return
    if (folderDialog.mode === 'create') {
      const folder = createFolder(name)
      setActiveFolder(folder.id)
    } else if (folderDialog.id) {
      renameFolder(folderDialog.id, name)
    }
    setFolderDialog(null)
  }

  const assignFolder = async (folderId: string | null): Promise<void> => {
    if (!moveTarget || moveTarget.id === undefined) return
    await moveCharactersToFolder([moveTarget.id], folderId)
    setMoveTarget(null)
  }

  const confirmDeleteFolder = async (): Promise<void> => {
    if (!deleteFolderTarget) return
    await deleteFolder(deleteFolderTarget.id)
    if (activeFolder === deleteFolderTarget.id) setActiveFolder('all')
    setDeleteFolderTarget(null)
  }

  const createInActiveFolder = (): void => {
    onCreateCharacter(activeFolder === 'all' || activeFolder === 'none' ? null : activeFolder)
  }

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
          onClick={createInActiveFolder}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 h-[60px] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink font-serif font-bold">{kindLabel}</h2>
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
              placeholder={`搜索${kindLabel}...`}
              className="h-9 w-48 rounded border border-line bg-paper-card/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
            />
          </div>
          {kind === 'character' ? (
            <>
              <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
              <CountryFilterSelect
                value={countryFilter}
                onChange={setCountryFilter}
                options={countryOptions}
              />
            </>
          ) : null}
          <Separator orientation="vertical" className="max-md:hidden md:flex h-4 !self-center" />
          <SortViewControls
            sortKey={sortKey}
            onSortChange={handleSortChange}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
          />
        </div>
        <button
          onClick={createInActiveFolder}
          className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建{kindLabel}</span>
        </button>
      </div>

      <MobileFilterBar>
        <div className="flex items-center gap-2">
          {kind === 'character' ? (
            <CountryFilterSelect
              value={countryFilter}
              onChange={setCountryFilter}
              options={countryOptions}
            />
          ) : null}
          <SortSelect
            sortKey={sortKey}
            onChange={handleSortChange}
            options={SORT_OPTIONS}
          />
        </div>
        <button
          onClick={createInActiveFolder}
          className="touch-feedback flex h-7 items-center gap-1 rounded border border-line bg-paper-card/60 px-2.5 text-[11px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>

      <div className="max-md:h-10 flex-shrink-0" />

      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveFolder('all')}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
            activeFolder === 'all'
              ? 'border-line-hover bg-paper-card text-ink'
              : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
          }`}
        >
          全部
          <span className="text-ink-faint">{kindCharacters.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFolder('none')}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
            activeFolder === 'none'
              ? 'border-line-hover bg-paper-card text-ink'
              : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
          }`}
        >
          <Folder size={12} strokeWidth={2} />
          未分类
          <span className="text-ink-faint">{folderCounts.uncategorized}</span>
        </button>
        {folders.map((folder) => (
          <div
            key={folder.id}
            className={`flex h-7 shrink-0 items-center rounded-md border transition-colors ${
              activeFolder === folder.id
                ? 'border-line-hover bg-paper-card text-ink'
                : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveFolder(folder.id)}
              className="flex h-full max-w-[160px] items-center gap-1 pl-2 text-[11px]"
              title={folder.name}
            >
              <Folder size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{folder.name}</span>
              <span className="shrink-0 text-ink-faint">{folderCounts.counts[folder.id] ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setFolderMenu({ id: folder.id, x: rect.right - 8, y: rect.bottom + 4 })
              }}
              className="flex h-full w-6 items-center justify-center rounded-r-md text-ink-faint hover:text-ink"
              title="文件夹操作"
            >
              <MoreHorizontal size={12} strokeWidth={2} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFolderDialog({ mode: 'create', value: '' })}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-dashed border-line px-2 text-[11px] text-ink-faint transition-colors hover:border-line-hover hover:text-ink"
        >
          <FolderPlus size={12} strokeWidth={2} />
          新建文件夹
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        {kindCharacters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={createInActiveFolder}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无{kindLabel}，点击创建第一个
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <span className="text-sm text-ink-muted">
              {search.trim()
                ? `没有找到匹配的${kindLabel}`
                : activeFolder === 'none'
                  ? `未分类中暂无${kindLabel}`
                  : `这个文件夹里还没有${kindLabel}`}
            </span>
            <button
              onClick={createInActiveFolder}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              在此新建{kindLabel}
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleCharacterDragEnd}
          >
            {viewMode === 'grid' ? (
              <SortableContext
                items={filtered.map((character) => character.id as number)}
                strategy={rectSortingStrategy}
              >
                <div className="columns-2 sm:columns-3 xl:columns-4 2xl:columns-5 gap-4">
                  {filtered.map((character) => (
                    <SortableCharacter
                      key={character.id}
                      id={character.id as number}
                      className="[break-inside:avoid] mb-4"
                    >
                      <CharacterCard
                        character={character}
                        onSelect={handleSelect}
                        onDelete={onDeleteCharacter}
                        onMove={() => setMoveTarget(character)}
                        onLongPress={() => openActionSheet(character)}
                        countryName={getCountryName(character)}
                        isMobile={isMobile}
                        onReorder={reorderCharacter}
                      />
                    </SortableCharacter>
                  ))}
                </div>
              </SortableContext>
            ) : (
              <SortableContext
                items={filtered.map((character) => character.id as number)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col">
                  {filtered.map((character) => (
                    <SortableCharacter
                      key={character.id}
                      id={character.id as number}
                      className="border-b border-line last:border-0"
                    >
                      <CharacterRow
                        character={character}
                        onSelect={handleSelect}
                        onDelete={onDeleteCharacter}
                        onMove={() => setMoveTarget(character)}
                        onLongPress={() => openActionSheet(character)}
                        countryName={getCountryName(character)}
                        isMobile={isMobile}
                        onReorder={reorderCharacter}
                      />
                    </SortableCharacter>
                  ))}
                </div>
              </SortableContext>
            )}
          </DndContext>
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

      <AlertDialog
        open={deleteFolderTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteFolderTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFolderTarget
                ? `文件夹「${deleteFolderTarget.name}」会被删除，里面的${kindLabel}会回到“未分类”，${kindLabel}本身不会被删除。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteFolder()}>
              删除文件夹
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {folderMenu
        ? createPortal(
            <div className="fixed inset-0 z-[9998]" onClick={() => setFolderMenu(null)}>
              <div
                className="absolute w-36 rounded-lg border border-line bg-paper p-1 shadow-xl"
                style={{
                  left: Math.min(folderMenu.x, window.innerWidth - 160),
                  top: Math.min(folderMenu.y, window.innerHeight - 110),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    const folder = folders.find((item) => item.id === folderMenu.id)
                    if (folder) {
                      setFolderDialog({ mode: 'rename', id: folder.id, value: folder.name })
                    }
                    setFolderMenu(null)
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-paper-card hover:text-ink"
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const folder = folders.find((item) => item.id === folderMenu.id)
                    if (folder) setDeleteFolderTarget(folder)
                    setFolderMenu(null)
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-error hover:bg-error/10"
                >
                  删除文件夹
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {folderDialog
        ? createPortal(
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) setFolderDialog(null)
              }}
            >
              <div className="w-[340px] rounded-xl border border-line bg-paper p-4 shadow-xl">
                <h3 className="font-serif text-base text-ink">
                  {folderDialog.mode === 'create' ? `新建${kindLabel}文件夹` : '重命名文件夹'}
                </h3>
                <p className="mt-1 text-[11px] text-ink-muted">
                  文件夹只用于整理{kindLabel}，删除文件夹不会删除{kindLabel}。
                </p>
                <input
                  autoFocus
                  value={folderDialog.value}
                  onChange={(event) =>
                    setFolderDialog((current) =>
                      current ? { ...current, value: event.target.value } : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitFolderDialog()
                    if (event.key === 'Escape') setFolderDialog(null)
                  }}
                  placeholder="文件夹名称，例如：主角团"
                  className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFolderDialog(null)}
                    className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submitFolderDialog}
                    disabled={!folderDialog.value.trim()}
                    className="h-8 rounded-lg bg-ink px-3 text-xs text-paper hover:opacity-90 disabled:opacity-40"
                  >
                    {folderDialog.mode === 'create' ? '创建' : '保存'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moveTarget
        ? createPortal(
            <div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) setMoveTarget(null)
              }}
            >
              <div className="w-[340px] rounded-xl border border-line bg-paper p-4 shadow-xl">
                <h3 className="font-serif text-base text-ink">
                  移动「{moveTarget.name}」
                </h3>
                <p className="mt-1 text-[11px] text-ink-muted">选择目标文件夹</p>
                <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => void assignFolder(null)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      !moveTarget.folderId
                        ? 'border-line-hover bg-paper-card text-ink'
                        : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                    }`}
                  >
                    <Folder size={14} strokeWidth={2} />
                    未分类
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => void assignFolder(folder.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        moveTarget.folderId === folder.id
                          ? 'border-line-hover bg-paper-card text-ink'
                          : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                      }`}
                    >
                      <Folder size={14} strokeWidth={2} />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                  {folders.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMoveTarget(null)
                        setFolderDialog({ mode: 'create', value: '' })
                      }}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-left text-sm text-ink-faint hover:border-line-hover hover:text-ink"
                    >
                      <FolderPlus size={14} strokeWidth={2} />
                      新建文件夹
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMoveTarget(null)}
                    className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
