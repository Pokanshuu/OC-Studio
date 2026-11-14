'use client'

import { useState, useMemo, useCallback } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { CalendarDays, CircleAlert, Pencil, SearchX, Trash2 } from 'lucide-react'
import type { Event } from '@/types'
import { sortEvents } from '../utils'
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
import { useDevice } from '@/lib/use-device'
import { MobileFab } from '@/components/layout/MobileFab'
import { EventCard, EventRow } from './EventListItems'
import { EventListToolbar } from './EventListToolbar'
import { ListShell } from '@/components/shared/ListShell'
import { CoverFlow } from '@/components/shared/CoverFlow'
import { VerticalSplit } from '@/components/shared/VerticalSplit'
import { readViewPreference, writeViewPreference, SORT_STORAGE_KEY } from './event-list-utils'
import type { SortKey } from './event-list-utils'
import { readSortKey, writeSortKey } from '@/lib/sort-manual'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { useReorderEvents } from '../hooks/useEvents'
import { LIST_GRID, LOADING_TEXT } from '@/lib/ui-tokens'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { useDelayedFlag } from '@/lib/use-delayed-flag'
import { useListNavigation } from '@/lib/use-list-navigation'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'

interface EventListProps {
  events: Event[]
  loading: boolean
  error: string | null
  /** 加载失败时的重新拉取（**不是**新建）：由调用方传入数据 hook 的 refresh */
  onRetry: () => void
  onSelectEvent: (id: number) => void
  onCreateEvent: () => void
  onDeleteEvent: (id: number) => void
}

export function EventList({
  events,
  loading,
  error,
  onRetry,
  onSelectEvent,
  onCreateEvent,
  onDeleteEvent,
}: EventListProps) {
  const { isMobile } = useDevice()
  const handleSelect = useMemo(() => withTouchFeedback(onSelectEvent), [onSelectEvent])
  const [sortKey, setSortKey] = useState<SortKey>(() => readSortKey(SORT_STORAGE_KEY, 'updatedAt'))
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [search, setSearch] = useState('')
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [deleteTargets, setDeleteTargets] = useState<number[] | null>(null)
  /** 列表右键菜单 */
  const [listMenu, setListMenu] = useState<{ ids: number[]; at: { x: number; y: number } } | null>(null)

  const openActionSheet = useCallback((ev: Event) => {
    setActionSheet({
      open: true,
      title: ev.title,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectEvent(ev.id) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTargets([ev.id]) },
      ],
    })
  }, [onSelectEvent])

  const filteredEvents = useMemo(() => {
    let result = events
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.time.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q),
      )
    }
    return sortEvents(result, sortKey)
  }, [events, sortKey, search])

  const handleSortChange = (key: SortKey) => {
    setSortKey(key)
    writeSortKey(SORT_STORAGE_KEY, key)
  }

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    writeViewPreference(mode)
  }

  const manual = sortKey === 'manual'
  const reorderEvents = useReorderEvents()

  const handleReorder = useCallback(
    (activeId: number | string, overId: number | string) => {
      const base = sortEvents(events, 'manual').map((e) => e.id)
      void reorderEvents(moveId(base, Number(activeId), Number(overId)))
    },
    [events, reorderEvents],
  )

  /**
   * 加载态不闪：页头与外壳照常渲染，内容区在 200ms 内什么都不画，
   * 超过才显示「加载中…」（本地库通常在第一帧就回来了）。
   */
  const showLoading = useDelayedFlag(loading)

  /** 桌面列表选中模型（移动端不启用：长按动作表是那边的入口） */
  const listNav = useListNavigation<number>({
    ids: filteredEvents.map((e) => e.id),
    onOpen: (id) => handleSelect(id),
    onDelete: (ids) => setDeleteTargets(ids),
    onContextMenu: (ids, at) => setListMenu({ ids, at }),
    enabled: !isMobile,
  })

  const confirmDelete = useCallback(() => {
    const targets = deleteTargets
    setDeleteTargets(null)
    if (!targets) return
    for (const id of targets) onDeleteEvent(id)
  }, [deleteTargets, onDeleteEvent])

  return (
    <>
      <ListShell
        fill={viewMode === 'gallery'}
        header={() => (
          <EventListToolbar
            search={search}
            onSearchChange={setSearch}
            sortKey={sortKey}
            onSortKeyChange={handleSortChange}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
            onCreateEvent={onCreateEvent}
          />
        )}
      >
        <div className="max-md:h-10" />
        <div className={viewMode === 'gallery' ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-1 flex-col p-4'}>
        {loading ? (
          showLoading ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <span className={LOADING_TEXT}>加载中…</span>
            </div>
          ) : null
        ) : error ? (
          <ListEmptyState
            icon={CircleAlert}
            message={error}
            action={{ label: '重试', onClick: onRetry }}
          />
        ) : events.length === 0 ? (
          <ListEmptyState
            icon={CalendarDays}
            message="还没有事件"
            action={{ label: '创建第一个', onClick: onCreateEvent }}
          />
        ) : filteredEvents.length === 0 ? (
          <ListEmptyState
            icon={SearchX}
            message="没有匹配的事件"
            action={{ label: '清除筛选', onClick: () => setSearch('') }}
          />
        ) : viewMode === 'gallery' ? (
          <VerticalSplit
            storageKey="oc-events-gallery-split"
            className="min-h-0 flex-1"
            top={
              <CoverFlow fill aspect={7 / 6} maxItemWidth={540} className="h-full">
                {filteredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    nav={listNav.itemProps(event.id)}
                    onSelect={handleSelect}
                    onDelete={onDeleteEvent}
                    onLongPress={() => openActionSheet(event)}
                    isMobile={isMobile}
                  />
                ))}
              </CoverFlow>
            }
            bottom={
              <SortableList
                ids={filteredEvents.map((e) => e.id)}
                onReorder={handleReorder}
                layout="list"
                disabled={!manual}
              >
                <div className="flex flex-col rules-end px-1" {...listNav.containerProps}>
                  {filteredEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      nav={listNav.itemProps(event.id)}
                      onSelect={handleSelect}
                      onDelete={onDeleteEvent}
                      onLongPress={() => openActionSheet(event)}
                      isMobile={isMobile}
                      sortable={manual}
                    />
                  ))}
                </div>
              </SortableList>
            }
          />
        ) : viewMode === 'grid' ? (
          <SortableList
            ids={filteredEvents.map((e) => e.id)}
            onReorder={handleReorder}
            layout="grid"
            disabled={!manual}
          >
            <div className={LIST_GRID} {...listNav.containerProps}>
              {filteredEvents.map((event) => (
                <div key={event.id}>
                  <EventCard
                    event={event}
                    nav={listNav.itemProps(event.id)}
                    onSelect={handleSelect}
                    onDelete={onDeleteEvent}
                    onLongPress={() => openActionSheet(event)}
                    isMobile={isMobile}
                    sortable={manual}
                  />
                </div>
              ))}
            </div>
          </SortableList>
        ) : viewMode === 'list' ? (
          <SortableList
            ids={filteredEvents.map((e) => e.id)}
            onReorder={handleReorder}
            layout="list"
            disabled={!manual}
          >
            <div className="flex flex-col rules-end" {...listNav.containerProps}>
              {filteredEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  nav={listNav.itemProps(event.id)}
                  onSelect={handleSelect}
                  onDelete={onDeleteEvent}
                  onLongPress={() => openActionSheet(event)}
                  isMobile={isMobile}
                  sortable={manual}
                />
              ))}
            </div>
          </SortableList>
        ) : null}
        <MobileFab viewMode={viewMode} onViewModeChange={handleViewChange} />
        </div>
      </ListShell>

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((prev) => ({ ...prev, open: false }))}
        title={actionSheet.title}
        actions={actionSheet.actions}
      />

      <AlertDialog open={deleteTargets !== null} onOpenChange={(open) => { if (!open) setDeleteTargets(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargets !== null && deleteTargets.length > 1
                ? `删除 ${deleteTargets.length} 项？删除后可在回收站恢复。`
                : '删除后将移至回收站，可在回收站里恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {listMenu ? (
        <MediaContextMenu
          at={listMenu.at}
          onClose={() => setListMenu(null)}
          items={[
            ...(listMenu.ids.length === 1
              ? [{ label: '打开', onSelect: () => handleSelect(listMenu.ids[0]) }]
              : []),
            {
              label: listMenu.ids.length > 1 ? `删除 ${listMenu.ids.length} 项` : '删除',
              danger: true,
              icon: <Trash2 size={13} strokeWidth={2} />,
              onSelect: () => setDeleteTargets(listMenu.ids),
            },
          ]}
        />
      ) : null}
    </>
  )
}
