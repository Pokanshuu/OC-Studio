'use client'

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { ArrowLeft, FolderOpen, Pencil, SearchX, Trash2, Users } from 'lucide-react'
import type { Character } from '@/types'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { resolveCharacterCountryId } from '@/lib/membership'
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
import { CharacterFolderBar, folderEmptyHint, type FolderFilter } from './CharacterFolderBar'
import { createFolder, deleteFolder, listFolders, loadFolderRegistry, mergeIntoNewFolder, moveCharacterToFolder, renameFolder, useFolderRegistry } from '../folders'
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
import { BTN_QUIET, CENTER_STATE, CHIP, LIST_GRID } from '@/lib/ui-tokens'
import { ListEmptyState } from '@/components/shared/ListEmptyState'

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

  /*
   * 打开 / 返回文件夹的切换动画：内容整块从**被点的那一块**展开（返回时缩小落回）。
   * 只动 transform + opacity，不动布局；来源坐标在点击时量好，effect 里直接用。
   */
  const contentRef = useRef<HTMLDivElement | null>(null)
  const swapOrigin = useRef<{ x: number; y: number } | null>(null)
  const swapAnimation = useRef<Animation | null>(null)
  const previousFolder = useRef<FolderFilter>(folderFilter)

  /** 记下点击位置相对内容容器的坐标（没传事件 = 不播动画，比如菜单 / 弹窗改的筛选） */
  const captureOrigin = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    const target = event?.currentTarget
    const container = contentRef.current
    if (!target || !container) {
      swapOrigin.current = null
      return
    }
    const targetRect = target.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    swapOrigin.current = {
      x: targetRect.left + targetRect.width / 2 - containerRect.left,
      y: targetRect.top + targetRect.height / 2 - containerRect.top,
    }
  }, [])

  const swapFolder = useCallback(
    (next: FolderFilter, event?: React.MouseEvent<HTMLElement>) => {
      captureOrigin(event)
      setFolderFilter(next)
    },
    [captureOrigin],
  )

  useLayoutEffect(() => {
    const previous = previousFolder.current
    previousFolder.current = folderFilter
    if (previous === folderFilter) return
    const element = contentRef.current
    const origin = swapOrigin.current
    swapOrigin.current = null
    if (!element || !origin) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // 进夹 = 展开；回退 = 收回（初始略大，落回原尺寸）
    const entering = folderFilter !== 'all'
    element.style.transformOrigin = `${origin.x}px ${origin.y}px`
    // 连点两下时，上一段动画还在跑会和新的一段抢 transform：先收掉
    swapAnimation.current?.cancel()
    swapAnimation.current = element.animate(
      entering
        ? [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'scale(1)' },
          ]
        : [
            { opacity: 0, transform: 'scale(1.03)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
      { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [folderFilter])

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

  /**
   * 拖拽成夹（卡片视图 · 手动排序）：拖着的一张卡压住另一张停一下，松手就把这两张
   * 收进一个新文件夹。名字自动取（`新建文件夹`），不在这里插一个输入框。
   */
  const handleMergeIntoFolder = useCallback(
    async (activeId: number | string, targetId: number | string) => {
      const ids = [Number(activeId), Number(targetId)]
      if (ids[0] === ids[1] || ids.some((id) => !Number.isFinite(id))) return
      try {
        const name = await mergeIntoNewFolder(ids, folderNames)
        notifyDataUpdated()
        toast.success(`已新建文件夹「${name}」`, { description: `${ids.length} 个角色已放进去` })
      } catch (err) {
        toast.error('新建文件夹失败', { description: err instanceof Error ? err.message : String(err) })
      }
    },
    [folderNames],
  )

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
      // 与卡片显示同一口径：旧数据只有 `国籍:` 文本时也认（否则「卡上写着晨曦共和国、按它筛却没有」）
      result = result.filter((c) => resolveCharacterCountryId(c, countries) === countryFilter)
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
  }, [characters, sortKey, search, countryFilter, folderFilter, countries])

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
                onChange={swapFolder}
                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
                onCreate={handleCreateFolder}
              />
            ) : null}
          </>
        )}
      >
        <div className="max-md:h-10 shrink-0" />
        <div className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col p-4'}>
        {/*
          文件夹切换动画只作用在这一层：MobileFab 是 fixed 的，放进被 transform 的容器里
          会跟着缩放、并改成相对它定位。
        */}
        <div
          ref={contentRef}
          className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}
        >
        {/*
          站在文件夹里就**一直**有返回键 —— 包括空文件夹。返回键原来写在「有内容」的分支里，
          于是「新建文件夹」这种空夹一点进去就是一个没有出口的空态。
        */}
        {inFolder ? (
          <div
            className={`mb-3 flex shrink-0 items-center gap-2 ${
              // 画廊是填充分栏（外层没有 p-4）：自己补上和卡片视图一致的留白，
              // 否则返回键会紧贴着页头，三个视图看起来不是同一个东西
              viewMode === 'gallery' ? 'px-4 pt-4' : ''
            }`}
          >
            <button type="button" onClick={(event) => swapFolder('all', event)} className={CHIP}>
              <ArrowLeft size={12} strokeWidth={2} />
              全部
            </button>
            <span className="text-[13px] text-ink">
              {folderFilter === 'ungrouped' ? '未分组' : folderFilter}
            </span>
          </div>
        ) : null}
        {characters.length === 0 ? (
          <ListEmptyState
            icon={Users}
            message="还没有角色"
            action={{ label: '创建第一个', onClick: onCreateCharacter }}
          />
        ) : filtered.length === 0 ? (
          <ListEmptyState
            icon={search.trim() || countryFilter !== 'all' ? SearchX : FolderOpen}
            message={search.trim() || countryFilter !== 'all' ? '没有匹配的角色' : folderEmptyHint(folderFilter)}
            /*
             * 空夹里不给「创建第一个」：建出来的角色落在未分组，回来还是空夹 —— 这里只留出口。
             */
            action={
              search.trim() || countryFilter !== 'all'
                ? {
                    label: '清除筛选',
                    onClick: () => {
                      setSearch('')
                      setCountryFilter('all')
                      swapFolder('all')
                    },
                  }
                : inFolder
                  ? { label: '回到全部', onClick: (event) => swapFolder('all', event) }
                  : { label: '创建第一个', onClick: onCreateCharacter }
            }
          />
        ) : (
          <>
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
                              onOpen={(event) => swapFolder(folder.name, event)}
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

            {viewMode === 'grid' ? (
          <SortableList
            ids={filtered.map((c) => c.id)}
            onReorder={handleReorder}
            // 拖拽成夹：站在文件夹里再叠一张没有地方放（夹不嵌套），所以只在「全部」里给
            onMerge={manual && !inFolder ? handleMergeIntoFolder : undefined}
            layout="grid"
            disabled={!manual}
          >
            <div className={LIST_GRID}>
              {/* 文件夹和角色卡在**同一个网格**里：单独排一行会在末尾留一个空格子 */}
              {!inFolder
                ? folders.map((folder) => (
                    <FolderStack
                      key={`folder-${folder.name}`}
                      name={folder.name}
                      count={folder.count}
                      covers={stackCover(folder.name)}
                      onOpen={(event) => swapFolder(folder.name, event)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setStackMenu({ name: folder.name, at: { x: event.clientX, y: event.clientY } })
                      }}
                    />
                  ))
                : null}
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
        </div>
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
              删除后将移至回收站，可在回收站里恢复。
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


