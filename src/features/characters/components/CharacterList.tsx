'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { ArrowLeft, FolderOpen, Pencil, Trash2 } from 'lucide-react'
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
import { ListShell } from '@/components/shared/ListShell'
import { CoverFlow } from '@/components/shared/CoverFlow'
import { FolderStack } from '@/components/shared/FolderStack'
import { VerticalSplit } from '@/components/shared/VerticalSplit'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { FolderManageDialog } from './FolderManageDialog'
import { resolveImageUrl } from '@/lib/image-service'
import { CharacterListToolbar } from './CharacterListToolbar'
import { CharacterFolderBar, type FolderFilter } from './CharacterFolderBar'
import { createFolder, deleteFolder, listFolders, loadFolderRegistry, moveCharacterToFolder, renameFolder, useFolderRegistry } from '../folders'
import { toast } from 'sonner'
import { notifyDataUpdated } from '@/lib/data-events'
import type { FilterOption } from '@/components/shared/FilterSelect'
import {
  readViewPreference,
  writeViewPreference,
  sortCharacters,
  aliasesMatch,
  SORT_STORAGE_KEY,
} from './character-list-utils'
import { readSortKey, writeSortKey } from '@/lib/sort-manual'
import type { SortKey } from './character-list-utils'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { useReorderCharacters } from '../hooks/useCharacters'
import { BTN_QUIET, CENTER_STATE, CHIP, EMPTY_HINT, LIST_GRID } from '@/lib/ui-tokens'

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
  const [sortKey, setSortKey] = useState<SortKey>(() => readSortKey(SORT_STORAGE_KEY, 'updatedAt'))
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState<number | 'all'>('all')
  const { countries } = useCountryList()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  /** 右键「堆」弹出的菜单（重命名 / 管理内容 / 删除） */
  const [stackMenu, setStackMenu] = useState<{ name: string; at: { x: number; y: number } } | null>(null)
  const [folderDialog, setFolderDialog] = useState<{ mode: 'rename' | 'members'; name: string } | null>(null)

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

  const countryOptions = useMemo<FilterOption[]>(() => {
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

  // 空文件夹的清单（`.ocstudio/folders.json`）—— 只有角色时，空夹没有地方挂
  useEffect(() => {
    void loadFolderRegistry()
  }, [])

  const registeredFolders = useFolderRegistry()
  const { folders, ungrouped } = useMemo(
    () => listFolders(characters, registeredFolders),
    [characters, registeredFolders],
  )
  const folderNames = useMemo(() => folders.map((folder) => folder.name), [folders])
  /** 是否正「站在某个文件夹里」（卡片 / 画廊视图点堆进入） */
  const inFolder = folderFilter !== 'all'

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      await createFolder(name)
    } catch (err) {
      toast.error('新建文件夹失败', { description: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }, [])

  const handleRenameFolder = useCallback(
    async (from: string, to: string) => {
      const moved = await renameFolder(from, to)
      toast.success(`已重命名为「${to}」`, { description: `${moved} 个角色跟着走，角色本身没动` })
      notifyDataUpdated()
      if (folderFilter === from) setFolderFilter(to)
    },
    [folderFilter],
  )

  const handleDeleteFolder = useCallback(
    async (name: string) => {
      const count = await deleteFolder(name)
      toast.success(`已删除文件夹「${name}」`, { description: `${count} 个角色回到未分组，一个都没删` })
      notifyDataUpdated()
      if (folderFilter === name) setFolderFilter('all')
    },
    [folderFilter],
  )

  const handleMoveToFolder = useCallback((id: number, folder: string | null) => {
    void moveCharacterToFolder(id, folder).then(() => notifyDataUpdated())
  }, [])

  /** 堆的正面：取第一个有图的成员（只一张，足够表现「里面是什么」） */
  const stackCover = useCallback(
    (name: string): string[] => {
      const member = characters.find(
        (character) => (character.folder ?? '').trim() === name && (character.headerUrl || character.avatarUrl),
      )
      if (!member) return []
      const src = member.headerUrl
        ? resolveImageUrl(member.headerUrl, 'header')
        : resolveImageUrl(member.avatarUrl as string, 'avatar')
      return src ? [src] : []
    },
    [characters],
  )

  const filtered = useMemo(() => {
    let result = characters
    if (folderFilter === 'ungrouped') {
      result = result.filter((c) => !(c.folder ?? '').trim())
    } else if (folderFilter !== 'all') {
      result = result.filter((c) => (c.folder ?? '').trim() === folderFilter)
    }
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
  }, [characters, sortKey, search, countryFilter, folderFilter])

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    writeViewPreference(mode)
  }

  const handleSortChange = (key: SortKey) => {
    setSortKey(key)
    writeSortKey(SORT_STORAGE_KEY, key)
  }

  const manual = sortKey === 'manual'
  const reorderCharacters = useReorderCharacters()

  // 拖拽后按「全集的手动顺序」重排，再把 0..n-1 写回实体（筛选时也不打乱全局）
  const handleReorder = useCallback(
    (activeId: number | string, overId: number | string) => {
      const base = sortCharacters(characters, 'manual').map((c) => c.id)
      void reorderCharacters(moveId(base, Number(activeId), Number(overId)))
    },
    [characters, reorderCharacters],
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
          onClick={onCreateCharacter}
          className={BTN_QUIET}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <>
      <ListShell
        fill={viewMode === 'gallery'}
        header={() => (
          <>
            <CharacterListToolbar
              search={search}
              onSearchChange={setSearch}
              countryFilter={countryFilter}
              onCountryFilterChange={setCountryFilter}
              countryOptions={countryOptions}
              sortKey={sortKey}
              onSortKeyChange={handleSortChange}
              viewMode={viewMode}
              onViewModeChange={handleViewChange}
              onCreateCharacter={onCreateCharacter}
            />
            {characters.length > 0 && viewMode === 'list' ? (
              <CharacterFolderBar
                folders={folders}
                ungrouped={ungrouped}
                total={characters.length}
                value={folderFilter}
                onChange={setFolderFilter}
                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
                onCreate={handleCreateFolder}
              />
            ) : null}
          </>
        )}
      >
        <div className="max-md:h-10" />
        <div className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'p-4 flex flex-col'}>
        {characters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onCreateCharacter}
              className={EMPTY_HINT}
            >
              暂无角色，点击创建第一个
            </button>
          </div>
        ) : (
          <>
            {inFolder ? (
              <div className="mb-3 flex items-center gap-2">
                <button type="button" onClick={() => setFolderFilter('all')} className={CHIP}>
                  <ArrowLeft size={12} strokeWidth={2} />
                  全部
                </button>
                <span className="text-[13px] text-ink">
                  {folderFilter === 'ungrouped' ? '未分组' : folderFilter}
                </span>
              </div>
            ) : null}

            {viewMode === 'gallery' ? (
              <VerticalSplit
                storageKey="oc-characters-gallery-split"
                className="min-h-0 flex-1"
                top={
                  <CoverFlow fill aspect={7 / 6} maxItemWidth={540} className="h-full">
                    {[
                      ...(!inFolder
                        ? folders.map((folder) => (
                            <FolderStack
                              key={`folder-${folder.name}`}
                              name={folder.name}
                              count={folder.count}
                              covers={stackCover(folder.name)}
                              onOpen={() => setFolderFilter(folder.name)}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                setStackMenu({ name: folder.name, at: { x: event.clientX, y: event.clientY } })
                              }}
                            />
                          ))
                        : []),
                      ...filtered.map((character) => (
                        <CharacterCard
                          key={character.id}
                          character={character}
                          onSelect={handleSelect}
                          folders={folderNames}
                          onMoveToFolder={handleMoveToFolder}
                          onDelete={onDeleteCharacter}
                          onLongPress={() => openActionSheet(character)}
                          countryName={getCountryName(character)}
                          isMobile={isMobile}
                        />
                      )),
                    ]}
                  </CoverFlow>
                }
                bottom={
                  <SortableList
                    activation="longPress"
                    ids={filtered.map((c) => c.id)}
                    onReorder={handleReorder}
                    layout="list"
                    disabled={!manual}
                  >
                    <div className="flex flex-col rules-end px-1">
                      {filtered.map((character) => (
                        <CharacterRow
                          key={character.id}
                          character={character}
                          onSelect={handleSelect}
                          folders={folderNames}
                          onMoveToFolder={handleMoveToFolder}
                          onDelete={onDeleteCharacter}
                          onLongPress={() => openActionSheet(character)}
                          countryName={getCountryName(character)}
                          isMobile={isMobile}
                          sortable={manual}
                        />
                      ))}
                    </div>
                  </SortableList>
                }
              />
            ) : null}

            {viewMode === 'grid' && !inFolder && folders.length > 0 ? (
              <div className={`${LIST_GRID} mb-4`}>
                {folders.map((folder) => (
                  <FolderStack
                    key={folder.name}
                    name={folder.name}
                    count={folder.count}
                    covers={stackCover(folder.name)}
                    onOpen={() => setFolderFilter(folder.name)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setStackMenu({ name: folder.name, at: { x: event.clientX, y: event.clientY } })
                    }}
                  />
                ))}
              </div>
            ) : null}

            {viewMode === 'grid' ? (
          <SortableList
              activation="longPress"
            ids={filtered.map((c) => c.id)}
            onReorder={handleReorder}
            layout="grid"
            disabled={!manual}
          >
            <div className={LIST_GRID}>
              {filtered.map((character) => (
                <div key={character.id}>
                  <CharacterCard
                    character={character}
                    onSelect={handleSelect}
          folders={folders.map((f) => f.name)}
          onMoveToFolder={(id, folder) => {
            void moveCharacterToFolder(id, folder).then(() => notifyDataUpdated())
          }}
                    onDelete={onDeleteCharacter}
                    onLongPress={() => openActionSheet(character)}
                    countryName={getCountryName(character)}
                    isMobile={isMobile}
                    sortable={manual}
                  />
                </div>
              ))}
            </div>
          </SortableList>
            ) : viewMode === 'list' ? (
          <SortableList
              activation="longPress"
            ids={filtered.map((c) => c.id)}
            onReorder={handleReorder}
            layout="list"
            disabled={!manual}
          >
            <div className="flex flex-col rules-end">
              {filtered.map((character) => (
                <CharacterRow
                  key={character.id}
                  character={character}
                  onSelect={handleSelect}
          folders={folders.map((f) => f.name)}
          onMoveToFolder={(id, folder) => {
            void moveCharacterToFolder(id, folder).then(() => notifyDataUpdated())
          }}
                  onDelete={onDeleteCharacter}
                  onLongPress={() => openActionSheet(character)}
                  countryName={getCountryName(character)}
                  isMobile={isMobile}
                  sortable={manual}
                />
              ))}
            </div>
          </SortableList>
            ) : null}
          </>
        )}
        <MobileFab viewMode={viewMode} onViewModeChange={handleViewChange} />
        </div>
      </ListShell>

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

      {stackMenu ? (
        <MediaContextMenu
          at={stackMenu.at}
          onClose={() => setStackMenu(null)}
          items={[
            {
              label: '重命名',
              icon: <Pencil size={13} strokeWidth={2} />,
              onSelect: () => {
                const name = stackMenu.name
                setStackMenu(null)
                setFolderDialog({ mode: 'rename', name })
              },
            },
            {
              label: '管理内容',
              icon: <FolderOpen size={13} strokeWidth={2} />,
              onSelect: () => {
                const name = stackMenu.name
                setStackMenu(null)
                setFolderDialog({ mode: 'members', name })
              },
            },
            {
              label: '删除文件夹',
              danger: true,
              icon: <Trash2 size={13} strokeWidth={2} />,
              onSelect: () => {
                const name = stackMenu.name
                setStackMenu(null)
                void handleDeleteFolder(name)
              },
            },
          ]}
        />
      ) : null}

      <FolderManageDialog
        open={folderDialog !== null}
        mode={folderDialog?.mode ?? 'rename'}
        folder={folderDialog?.name ?? null}
        characters={characters}
        onClose={() => setFolderDialog(null)}
        onRename={handleRenameFolder}
        onToggleMember={async (id, inFolderFlag) => {
          const target = folderDialog?.name
          if (!target) return
          await moveCharacterToFolder(id, inFolderFlag ? target : null)
          notifyDataUpdated()
        }}
      />
    </>
  )
}


