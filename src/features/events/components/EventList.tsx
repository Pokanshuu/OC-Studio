'use client'

import { useState, useMemo, useCallback } from 'react'
import { withTouchFeedback } from '@/lib/animation'
import { Pencil, Trash2 } from 'lucide-react'
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
import { readViewPreference, writeViewPreference, SORT_STORAGE_KEY } from './event-list-utils'
import type { SortKey } from './event-list-utils'
import { readSortKey, writeSortKey } from '@/lib/sort-manual'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { useReorderEvents } from '../hooks/useEvents'
import { BTN_QUIET, CENTER_STATE, EMPTY_HINT, LIST_GRID } from '@/lib/ui-tokens'

interface EventListProps {
  events: Event[]
  loading: boolean
  error: string | null
  onSelectEvent: (id: number) => void
  onCreateEvent: () => void
  onDeleteEvent: (id: number) => void
}

export function EventList({
  events,
  loading,
  error,
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
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const openActionSheet = useCallback((ev: Event) => {
    setActionSheet({
      open: true,
      title: ev.title,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => onSelectEvent(ev.id) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(ev.id) },
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
          onClick={onCreateEvent}
          className={BTN_QUIET}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <EventListToolbar
        search={search}
        onSearchChange={setSearch}
        sortKey={sortKey}
        onSortKeyChange={handleSortChange}
        viewMode={viewMode}
        onViewModeChange={handleViewChange}
        onCreateEvent={onCreateEvent}
      />

      <div className="max-md:h-10 flex-shrink-0" />

      <div className="flex-1 p-4 flex flex-col">
        {events.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onCreateEvent}
              className={EMPTY_HINT}
            >
              暂无事件，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <SortableList
            ids={filteredEvents.map((e) => e.id)}
            onReorder={handleReorder}
            layout="grid"
            disabled={!manual}
          >
            <div className={LIST_GRID}>
              {filteredEvents.map((event) => (
                <div key={event.id} className="[break-inside:avoid] mb-4">
                  <EventCard
                    event={event}
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
        ) : (
          <SortableList
            ids={filteredEvents.map((e) => e.id)}
            onReorder={handleReorder}
            layout="list"
            disabled={!manual}
          >
            <div className="flex flex-col rules-end">
              {filteredEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onSelect={handleSelect}
                  onDelete={onDeleteEvent}
                  onLongPress={() => openActionSheet(event)}
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
                onDeleteEvent(deleteTarget)
                setDeleteTarget(null)
              }
            }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
