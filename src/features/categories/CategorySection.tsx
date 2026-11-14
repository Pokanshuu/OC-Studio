'use client'

/**
 * 一个自定义分类的列表页 + 条目编辑器。
 *
 * 条目就是普通笔记（`worldEntries`），靠 `category` 键归属；打开时留在分类里，
 * 由分类绑定的模板渲染（`CategoryEntryEditor`），不再把人扔进「世界观」的词条树。
 *
 * **列表页与角色 / 事件 / 国家列表同一套形态**：
 * `ListShell` + 工具栏 + 文件夹条（仅列表视图）+ 卡片 / 画廊 / 目录三视图 +
 * 文件夹堆 + 移动端 FAB + 整页加载 / 错误态。
 * 分类只决定「用哪个模板」，删分类也不会删笔记。
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FolderInput, FolderOpen, Pencil, SearchX, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { withTouchFeedback } from '@/lib/animation'
import type { WorldEntry } from '@/types'
import { db } from '@/lib/db'
import { listActive } from '@/lib/repository'
import { useCategories } from '@/lib/categories/store'
import { categoryIconOf } from '@/lib/categories/icons'
import { useDevice } from '@/lib/use-device'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { MobileFab } from '@/components/layout/MobileFab'
import { ListShell } from '@/components/shared/ListShell'
import { SectionSwap } from '@/components/shared/SectionSwap'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { CoverFlow } from '@/components/shared/CoverFlow'
import { FolderStack } from '@/components/shared/FolderStack'
import { VerticalSplit } from '@/components/shared/VerticalSplit'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { resolveImageUrl } from '@/lib/image-service'
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
import { BTN_QUIET, CENTER_STATE, CHIP, LIST_GRID } from '@/lib/ui-tokens'
import { createEntry, deleteEntry, reorderEntries } from '@/features/world/services'
import { DATA_UPDATED_EVENT, notifyDataUpdated } from '@/lib/data-events'
import { CategoryEntryEditor } from './CategoryEntryEditor'
import { CategoryListToolbar } from './CategoryListToolbar'
import { CategoryFolderManageDialog } from './CategoryFolderManageDialog'
import { CharacterFolderBar, folderEmptyHint, type FolderFilter } from '@/features/characters/components/CharacterFolderBar'
import {
  createWorldFolder,
  deleteWorldFolder,
  listWorldFolders,
  loadWorldFolderRegistry,
  moveWorldEntryToFolder,
  renameWorldFolder,
  useWorldFolderRegistry,
} from './folders'
import { CategoryRow } from './CategoryRow'
import { CategoryCard } from './CategoryCard'
import {
  entryBodyText,
  entryMatchesQuery,
  readCategorySortKey,
  readCategoryViewMode,
  sortCategoryEntries,
  writeCategorySortKey,
  writeCategoryViewMode,
  type CategorySortKey,
  type CategoryViewMode,
} from './category-list-utils'

function excerptOf(entry: WorldEntry): string {
  const summary = (entry.summary ?? '').trim()
  if (summary !== '') return summary.slice(0, 80)
  return entryBodyText(entry).slice(0, 80)
}

export function CategorySection({
  categoryId,
  openEntryRequest,
  onOpenEntryConsumed,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  categoryId: string
  /** 来自 [[内链]] / @ 引用的一次性打开指令（消费后通知上层清空） */
  openEntryRequest?: { entryId: number; nonce: number } | null
  onOpenEntryConsumed?: () => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const categories = useCategories()
  const category = categories.find((item) => item.id === categoryId)
  const queryClient = useQueryClient()
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<CategorySortKey>(readCategorySortKey)
  const [viewMode, setViewMode] = useState<CategoryViewMode>(readCategoryViewMode)
  const [deleteTarget, setDeleteTarget] = useState<WorldEntry | null>(null)
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [stackMenu, setStackMenu] = useState<{ name: string; at: { x: number; y: number } } | null>(null)
  const [folderDialog, setFolderDialog] = useState<{ mode: 'rename' | 'members'; name: string } | null>(null)
  /** 搜索框的值立刻更新，筛选 / 重排走延迟值（与角色列表同款） */
  const deferredSearch = useDeferredValue(search)
  const registeredFolders = useWorldFolderRegistry(category?.name ?? '')
  const { folders, ungrouped } = useMemo(
    () => listWorldFolders(entries, category?.name ?? '', registeredFolders),
    [entries, category?.name, registeredFolders],
  )
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [folderSheet, setFolderSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })

  const reload = useCallback(async () => {
    if (!category) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }
    try {
      const rows = await listActive(db.worldEntries, 'title')
      setEntries(rows.filter((row) => (row.category ?? '') === category.name))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    void reload()
    // 分类改名 / 外部导入会改笔记的 `category` 键，跟着刷新一次
    const handler = () => void reload()
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [reload])

  // 空文件夹清单（`.ocstudio/world-folders.json`）随库加载一次
  useEffect(() => {
    void loadWorldFolderRegistry()
  }, [])

  // 切分类时回到「全部」：上一个分类的文件夹名在这里不存在，留着只会得到一个空列表
  useEffect(() => {
    setFolderFilter('all')
  }, [categoryId])

  // 手机页头标题由这个页面注册；离开时清空，别把分类名留给下一个分区
  useEffect(() => {
    if (isMobile) setConfig(category?.name ?? null)
    else setConfig(null)
    return () => setConfig(null)
  }, [category?.name, isMobile, setConfig])

  // 打开前清掉这篇的查询缓存：刚保存过的标题 / 自定义字段还在旧缓存里，
  // 直接挂编辑器会先渲染旧值，`useEntry` 的 refetch 又不会重建内层 state。
  const openEntry = useCallback((id: number) => {
    queryClient.removeQueries({ queryKey: ['worldEntry', id] })
    setOpenId(id)
  }, [queryClient])

  // 内链 / @ 指定了要打开哪一条（只认 nonce，避免对象字面量每帧重跑）
  const requestEntryId = openEntryRequest?.entryId ?? null
  const requestNonce = openEntryRequest?.nonce ?? null
  useEffect(() => {
    if (requestEntryId === null) return
    openEntry(requestEntryId)
    onOpenEntryConsumed?.()
  }, [requestEntryId, requestNonce, onOpenEntryConsumed, openEntry])

  const inFolder = folderFilter !== 'all'
  const folderEntries = useMemo(() => {
    if (folderFilter === 'all') return entries
    if (folderFilter === 'ungrouped') return entries.filter((entry) => (entry.folder ?? '').trim() === '')
    return entries.filter((entry) => (entry.folder ?? '').trim() === folderFilter)
  }, [entries, folderFilter])

  const filtered = useMemo(
    () => sortCategoryEntries(folderEntries.filter((entry) => entryMatchesQuery(entry, deferredSearch)), sortKey),
    [deferredSearch, folderEntries, sortKey],
  )

  const manual = sortKey === 'manual'
  // 与实体列表同口径：只有「手动排序」才挂拖拽手柄
  const canReorder = manual

  const handleSelect = useMemo(
    () => withTouchFeedback((id: number) => openEntry(id)),
    [openEntry],
  )

  const handleReorder = useCallback(
    (activeId: number | string, overId: number | string) => {
      const base = sortCategoryEntries(entries, 'manual').map((entry) => entry.id)
      const next = moveId(base, Number(activeId), Number(overId))
      void reorderEntries(next.map((id, index) => ({ id, parentId: null, order: index })))
        .then(() => reload())
        .catch((err: unknown) => toast.error('排序失败', { description: String(err) }))
    },
    [entries, reload],
  )

  const handleSortChange = (key: CategorySortKey): void => {
    setSortKey(key)
    writeCategorySortKey(key)
  }

  const handleViewChange = (mode: CategoryViewMode): void => {
    setViewMode(mode)
    writeCategoryViewMode(mode)
  }

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!category) return
    try {
      await createWorldFolder(category.name, name)
    } catch (err) {
      toast.error('新建文件夹失败', { description: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }, [category])

  const handleRenameFolder = useCallback(async (from: string, to: string) => {
    if (!category) return
    const moved = await renameWorldFolder(category.name, from, to)
    toast.success(`已重命名为「${to}」`, { description: `${moved} 个条目跟着走，条目本身没动` })
    notifyDataUpdated()
    await reload()
    if (folderFilter === from) setFolderFilter(to)
  }, [category, folderFilter, reload])

  const handleDeleteFolder = useCallback(async (name: string) => {
    if (!category) return
    const count = await deleteWorldFolder(category.name, name)
    toast.success(`已删除文件夹「${name}」`, { description: `${count} 个条目回到未分组，一个都没删` })
    notifyDataUpdated()
    await reload()
    if (folderFilter === name) setFolderFilter('all')
  }, [category, folderFilter, reload])

  const handleMoveToFolder = useCallback((id: number, folder: string | null) => {
    if (!category) return
    void moveWorldEntryToFolder(id, category.name, folder)
      .then(() => {
        notifyDataUpdated()
        void reload()
      })
      .catch((err: unknown) => toast.error('移动失败', { description: String(err) }))
  }, [category, reload])

  const openActionSheet = useCallback((entry: WorldEntry) => {
    setActionSheet({
      open: true,
      title: entry.title || '未命名',
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => openEntry(entry.id) },
        {
          id: 'folder',
          label: '移到文件夹',
          icon: <FolderInput size={20} strokeWidth={2} />,
          onPress: () => setFolderSheet({
            open: true,
            title: `「${entry.title || '未命名'}」移到`,
            actions: [
              {
                id: 'ungrouped',
                label: '未分组',
                icon: <FolderInput size={20} strokeWidth={2} />,
                onPress: () => handleMoveToFolder(entry.id, null),
              },
              ...folders.map((folder) => ({
                id: `folder-${folder.name}`,
                label: folder.name,
                icon: <FolderInput size={20} strokeWidth={2} />,
                onPress: () => handleMoveToFolder(entry.id, folder.name),
              })),
            ],
          }),
        },
        {
          id: 'delete',
          label: '删除',
          icon: <Trash2 size={20} strokeWidth={2} />,
          destructive: true,
          onPress: () => setDeleteTarget(entry),
        },
      ],
    })
  }, [openEntry, folders, handleMoveToFolder])

  const handleCreate = async (): Promise<void> => {
    if (!category) return
    try {
      const id = await createEntry({
        title: '未命名',
        content: '',
        parentId: null,
        order: 0,
        isConcept: false,
        tags: [],
        category: category.name,
        folder: inFolder ? folderFilter : undefined,
      })
      notifyDataUpdated()
      await reload()
      openEntry(id)
    } catch (err) {
      toast.error('新建失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleDelete = async (): Promise<void> => {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      await deleteEntry(target.id)
      notifyDataUpdated()
      await reload()
    } catch (err) {
      toast.error('删除失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  /** 行内 `DeleteButton` 已经确认过一次，这里直接删，不再叠页面级对话框 */
  const handleDeleteDirect = useCallback(async (target: WorldEntry): Promise<void> => {
    try {
      await deleteEntry(target.id)
      notifyDataUpdated()
      await reload()
    } catch (err) {
      toast.error('删除失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }, [reload])

  /** 文件夹堆的封面：取该夹里第一条有图的条目（封面优先，其次头像） */
  const stackCover = useCallback((name: string): string[] => {
    const member = entries.find(
      (entry) => (entry.folder ?? '').trim() === name && (entry.cover || entry.avatar),
    )
    if (!member) return []
    const src = member.cover
      ? resolveImageUrl(member.cover, 'cover')
      : member.avatar
        ? resolveImageUrl(member.avatar, 'avatar')
        : null
    return src ? [src] : []
  }, [entries])

  if (!category) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">分类已被删除</span>
      </div>
    )
  }

  // 与实体列表同款：加载 / 错误走整页居中，不把工具条留在上面
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
        <button type="button" onClick={() => void reload()} className={BTN_QUIET}>
          重试
        </button>
      </div>
    )
  }

  const searching = search.trim() !== ''
  const emptyState = entries.length === 0 ? (
    <ListEmptyState
      icon={categoryIconOf(category.icon)}
      message={`「${category.name}」里还没有条目`}
      action={{ label: '创建第一个', onClick: () => void handleCreate() }}
    />
  ) : filtered.length === 0 ? (
    <ListEmptyState
      icon={searching ? SearchX : inFolder ? FolderOpen : SearchX}
      message={searching ? '没有匹配的条目' : inFolder ? folderEmptyHint(folderFilter, '条目') : '没有匹配的条目'}
      action={
        searching || !inFolder
          ? { label: '清除筛选', onClick: () => setSearch('') }
          : { label: '回到全部', onClick: () => setFolderFilter('all') }
      }
    />
  ) : null

  const renderFolderStack = (folder: { name: string; count: number }) => (
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
  )

  const renderRow = (entry: WorldEntry) => (
    <CategoryRow
      key={entry.id}
      entry={entry}
      excerpt={excerptOf(entry)}
      sortable={canReorder}
      isMobile={isMobile}
      onOpen={handleSelect}
      onDelete={(target) => void handleDeleteDirect(target)}
      onLongPress={() => openActionSheet(entry)}
      folders={folders.map((folder) => folder.name)}
      onMoveToFolder={(folder) => handleMoveToFolder(entry.id, folder)}
    />
  )

  const renderCard = (entry: WorldEntry) => (
    <CategoryCard
      key={entry.id}
      entry={entry}
      excerpt={excerptOf(entry)}
      sortable={canReorder}
      isMobile={isMobile}
      onOpen={handleSelect}
      // `CategoryCard` 里的删除是 `DeleteButton`（自带确认）：这里直接删，
      // 不能再 `setDeleteTarget`，否则会先弹一次再弹一次页面级对话框。
      onDelete={(target) => void handleDeleteDirect(target)}
      onLongPress={() => openActionSheet(entry)}
      folders={folders.map((folder) => folder.name)}
      onMoveToFolder={(folder) => handleMoveToFolder(entry.id, folder)}
    />
  )

  const backChip = inFolder ? (
    <div
      className={`mb-3 flex shrink-0 items-center gap-2 ${
        viewMode === 'gallery' ? 'px-4 pt-4' : ''
      }`}
    >
      <button type="button" onClick={() => setFolderFilter('all')} className={CHIP}>
        <ArrowLeft size={12} strokeWidth={2} />
        全部
      </button>
      <span className="text-[13px] text-ink">
        {folderFilter === 'ungrouped' ? '未分组' : folderFilter}
      </span>
    </div>
  ) : null

  const gallery = (
    <VerticalSplit
      storageKey="oc-categories-gallery-split"
      className="min-h-0 flex-1"
      top={
        <CoverFlow fill aspect={7 / 6} maxItemWidth={540} className="h-full">
          {[
            ...(!inFolder ? folders.map(renderFolderStack) : []),
            ...filtered.map(renderCard),
          ]}
        </CoverFlow>
      }
      bottom={
        <SortableList
          ids={filtered.map((entry) => entry.id)}
          onReorder={handleReorder}
          layout="list"
          disabled={!canReorder}
        >
          <div className="flex flex-col rules-end px-1">{filtered.map(renderRow)}</div>
        </SortableList>
      }
    />
  )

  const grid = (
    <SortableList
      ids={filtered.map((entry) => entry.id)}
      onReorder={handleReorder}
      layout="grid"
      disabled={!canReorder}
    >
      <div className={LIST_GRID}>
        {/* 文件夹和条目卡在同一个网格里：单独排一行会在末尾留一个空格子 */}
        {!inFolder ? folders.map(renderFolderStack) : null}
        {filtered.map((entry) => (
          <div key={entry.id}>{renderCard(entry)}</div>
        ))}
      </div>
    </SortableList>
  )

  const list = (
    <SortableList
      ids={filtered.map((entry) => entry.id)}
      onReorder={handleReorder}
      layout="list"
      disabled={!canReorder}
    >
      <div className="flex flex-col rules-end">{filtered.map(renderRow)}</div>
    </SortableList>
  )

  // 列表 ↔ 条目编辑器：与角色 / 事件 / 国家同一套滑动过渡（见 `SectionSwap`）
  return (
    <SectionSwap
      open={openId !== null}
      editor={
        openId !== null ? (
          <CategoryEntryEditor
            key={openId}
            entryId={openId}
            category={category}
            onBack={() => {
              setOpenId(null)
              void reload()
            }}
            onMentionClick={onMentionClick}
            onCharacterCount={onCharacterCount}
            onWikiLinkClick={onWikiLinkClick}
          />
        ) : null
      }
      list={
        <>
          <ListShell
            fill={viewMode === 'gallery'}
            header={() => (
              <>
                <CategoryListToolbar
                  title={category.name}
                  search={search}
                  onSearchChange={setSearch}
                  sortKey={sortKey}
                  onSortKeyChange={handleSortChange}
                  viewMode={viewMode}
                  onViewModeChange={handleViewChange}
                  onCreate={() => void handleCreate()}
                />
                {entries.length > 0 && viewMode === 'list' ? (
                  <CharacterFolderBar
                    folders={folders}
                    ungrouped={ungrouped}
                    total={entries.length}
                    value={folderFilter}
                    onChange={setFolderFilter}
                    onRename={handleRenameFolder}
                    onDelete={handleDeleteFolder}
                    onCreate={handleCreateFolder}
                    noun="条目"
                  />
                ) : null}
              </>
            )}
          >
            <div className="max-md:h-10 shrink-0" />
            <div className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col p-4'}>
              <div className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col'}>
                {backChip}
                {emptyState ?? (viewMode === 'gallery' ? gallery : viewMode === 'grid' ? grid : list)}
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

          <MobileActionSheet
            open={folderSheet.open}
            onClose={() => setFolderSheet((prev) => ({ ...prev, open: false }))}
            title={folderSheet.title}
            actions={folderSheet.actions}
          />

          <AlertDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>删除后将移至回收站，可在回收站里恢复。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()}>删除</AlertDialogAction>
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

          <CategoryFolderManageDialog
            open={folderDialog !== null}
            mode={folderDialog?.mode ?? 'rename'}
            folder={folderDialog?.name ?? null}
            entries={entries}
            onClose={() => setFolderDialog(null)}
            onRename={handleRenameFolder}
            onToggleMember={async (id, inFolderFlag) => {
              const target = folderDialog?.name
              if (!target) return
              await moveWorldEntryToFolder(id, category.name, inFolderFlag ? target : null)
              notifyDataUpdated()
              await reload()
            }}
          />
        </>
      }
    />
  )
}
