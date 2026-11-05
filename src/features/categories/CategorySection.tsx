'use client'

/**
 * 一个自定义分类的列表页 + 条目编辑器。
 *
 * 条目就是普通笔记（`worldEntries`），靠 `category` 键归属；打开时留在分类里，
 * 由分类绑定的模板渲染（`CategoryEntryEditor`），不再把人扔进「世界观」的词条树。
 *
 * 列表页与角色 / 事件列表同一套形态：`ListShell` + 共享工具栏 + 移动端筛选条；
 * 分类只决定「用哪个模板」，删分类也不会删笔记。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { withTouchFeedback } from '@/lib/animation'
import type { WorldEntry } from '@/types'
import { db } from '@/lib/db'
import { listActive } from '@/lib/repository'
import { useCategories } from '@/lib/categories/store'
import { useDevice } from '@/lib/use-device'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { ListShell } from '@/components/shared/ListShell'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { CoverFlow } from '@/components/shared/CoverFlow'
import { VerticalSplit } from '@/components/shared/VerticalSplit'
import { SortableList, moveId } from '@/components/shared/list-dnd'
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
import { CENTER_STATE, LIST_GRID, LOADING_TEXT } from '@/lib/ui-tokens'
import { createEntry, deleteEntry, reorderEntries } from '@/features/world/services'
import { DATA_UPDATED_EVENT, notifyDataUpdated } from '@/lib/data-events'
import { CategoryEntryEditor } from './CategoryEntryEditor'
import { CategoryListToolbar } from './CategoryListToolbar'
import { CategoryRow } from './CategoryRow'
import { CategoryCard } from './CategoryCard'
import { CategoryGalleryCard } from './CategoryGalleryCard'
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

  const filtered = useMemo(
    () => sortCategoryEntries(entries.filter((entry) => entryMatchesQuery(entry, search)), sortKey),
    [entries, search, sortKey],
  )

  const manual = sortKey === 'manual'
  const canReorder = manual && search.trim() === ''

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

  if (!category) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">分类已被删除</span>
      </div>
    )
  }

  if (openId !== null) {
    return (
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
    )
  }

  const status = loading ? (
    <div className={CENTER_STATE}>
      <span className={LOADING_TEXT}>加载中…</span>
    </div>
  ) : error ? (
    <ListEmptyState
      message={error}
      action={{ label: '重试', onClick: () => void reload() }}
      className="py-24"
    />
  ) : entries.length === 0 ? (
    <ListEmptyState
      message={`「${category.name}」里还没有条目`}
      action={{ label: '创建第一个', onClick: () => void handleCreate() }}
      className="py-24"
    />
  ) : filtered.length === 0 ? (
    <ListEmptyState
      message="没有匹配的条目"
      action={{ label: '清除搜索', onClick: () => setSearch('') }}
      className="py-24"
    />
  ) : null

  const rows = (
    <SortableList
      ids={filtered.map((entry) => entry.id)}
      onReorder={handleReorder}
      layout="list"
      disabled={!canReorder}
    >
      <div className="rules-end flex flex-col">
        {filtered.map((entry) => (
          <CategoryRow
            key={entry.id}
            entry={entry}
            excerpt={excerptOf(entry)}
            sortable={canReorder}
            onOpen={handleSelect}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>
    </SortableList>
  )

  return (
    <>
      <ListShell
        fill={viewMode === 'gallery'}
        header={() => (
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
        )}
      >
        <div className="max-md:h-10 shrink-0" />
        {viewMode === 'gallery' ? (
          status ? (
            <div className="flex flex-col p-4">{status}</div>
          ) : (
            <VerticalSplit
              storageKey="oc-categories-gallery-split"
              className="min-h-0 flex-1"
              top={
                <CoverFlow fill aspect={3 / 2} maxItemWidth={420} className="h-full">
                  {filtered.map((entry) => (
                    <CategoryGalleryCard
                      key={entry.id}
                      entry={entry}
                      excerpt={excerptOf(entry)}
                      onOpen={handleSelect}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </CoverFlow>
              }
              bottom={<div className="flex flex-col p-4">{rows}</div>}
            />
          )
        ) : (
          <div className="flex flex-col p-4">
            {status ?? (
              <SortableList
                ids={filtered.map((entry) => entry.id)}
                onReorder={handleReorder}
                layout={viewMode === 'grid' ? 'grid' : 'list'}
                disabled={!canReorder}
              >
                {viewMode === 'grid' ? (
                  <div className={LIST_GRID}>
                    {filtered.map((entry) => (
                      <CategoryCard
                        key={entry.id}
                        entry={entry}
                        excerpt={excerptOf(entry)}
                        sortable={canReorder}
                        onOpen={handleSelect}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                ) : (
                  rows
                )}
              </SortableList>
            )}
          </div>
        )}
      </ListShell>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.title || '未命名'}」</AlertDialogTitle>
            <AlertDialogDescription>删除后可在回收站找回。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
