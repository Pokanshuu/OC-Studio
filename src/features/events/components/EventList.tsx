'use client'

import { useState, useMemo } from 'react'
import {
  Plus,
  Circle,
  Search,
} from 'lucide-react'
import type { Event } from '@/types'
import { formatEventTime, formatRelativeTime, sortEvents } from '../utils'
import type { SortKey } from '../utils'
import { resolveImageUrl } from '@/lib/image-service'
import { DeleteButton } from '@/components/shared/DeleteButton'

function formatTimeDisplay(event: Event): string {
  const start = formatEventTime(event.time)
  if (!event.endTime) return start
  const end = formatEventTime(event.endTime)
  return `${start} ~ ${end}`
}
import { Separator } from '@/components/ui/separator'
import { SortViewControls } from '@/components/shared/SortViewControls'
import type { SortOption, ViewMode } from '@/components/shared/SortViewControls'

const SORT_OPTIONS: SortOption[] = [
  { label: '按事件时间', value: 'time' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-events-view') as ViewMode) ?? 'grid'
}

function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-events-view', mode)
  }
}

interface EventListProps {
  events: Event[]
  loading: boolean
  error: string | null
  onSelectEvent: (id: number) => void
  onCreateEvent: () => void
  onDeleteEvent: (id: number) => void
}

function EventCard({
  event,
  onSelect,
  onDelete,
}: {
  event: Event
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="relative">
      <button
        onClick={() => onSelect(event.id as number)}
        className="flex w-full flex-col rounded-md border border-line bg-paper-card overflow-hidden text-left transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
      >
        {event.headerUrl ? (
          <div className="relative w-full aspect-[3/1] bg-paper-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageUrl(event.headerUrl, 'header')}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 pr-6">
            {event.isMajor ? (
              <Circle size={8} fill="var(--color-error)" className="shrink-0 text-error" />
            ) : null}
            <h3 className="truncate text-sm font-medium text-ink">{event.title}</h3>
          </div>

          {event.time ? (
            <span className="text-xs text-ink-faint">{formatTimeDisplay(event)}</span>
          ) : null}

          {event.summary ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
              {event.summary}
            </p>
          ) : null}

          <span className="mt-auto text-xs text-ink-faint">
            编辑于 {formatRelativeTime(event.updatedAt)}
          </span>
        </div>
      </button>

      <div className="absolute right-3 top-3">
        <DeleteButton onDelete={() => onDelete(event.id as number)} />
      </div>
    </div>
  )
}

function EventRow({
  event,
  onSelect,
  onDelete,
}: {
  event: Event
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(event.id as number)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event.id as number)}
      onKeyDown={handleKeyDown}
      className="flex w-full cursor-pointer items-center gap-4 rounded-md px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {event.isMajor ? (
            <Circle size={8} fill="var(--color-error)" className="shrink-0 text-error" />
          ) : null}
          <h3 className="truncate text-sm font-medium text-ink">{event.title}</h3>
          {event.time ? (
            <span className="shrink-0 text-xs text-ink-faint">{formatTimeDisplay(event)}</span>
          ) : null}
        </div>
        <span className="text-xs text-ink-faint">
          编辑于 {formatRelativeTime(event.updatedAt)}
        </span>
      </div>
      {event.summary ? (
        <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">{event.summary}</p>
      ) : (
        <div className="flex-1" />
      )}
      <DeleteButton onDelete={() => onDelete(event.id as number)} />
    </div>
  )
}

export function EventList({
  events,
  loading,
  error,
  onSelectEvent,
  onCreateEvent,
  onDeleteEvent,
}: EventListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [viewMode, setViewMode] = useState<ViewMode>(readViewPreference)
  const [search, setSearch] = useState('')

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
          onClick={onCreateEvent}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 min-h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink">事件</h2>
          <Separator orientation="vertical" className="h-4 !self-center" />
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索事件..."
              className="h-9 w-48 rounded border border-line bg-paper-card/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
            />
          </div>
          <Separator orientation="vertical" className="h-4 !self-center" />
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => setSortKey(key as SortKey)}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={handleViewChange}
          />
        </div>
        <button
          onClick={onCreateEvent}
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建事件</span>
        </button>
      </div>

      <div className="flex-1 p-6 flex flex-col">
        {events.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onCreateEvent}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              暂无事件，点击创建第一个
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelect={onSelectEvent}
                onDelete={onDeleteEvent}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {filteredEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onSelect={onSelectEvent}
                onDelete={onDeleteEvent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
