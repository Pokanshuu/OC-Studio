'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { ROUND_ITEM } from '@/lib/ui-tokens'
import type { Event } from '@/types'
import { useEventList } from '../hooks/useEvents'

interface EventEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
}

/** 三栏左栏：搜索 + 事件行（标题 + 时间/地点）。不复制列表页的卡片/视图切换。 */
export function EventEditorList({ currentId, onSelect }: EventEditorListProps) {
  const { events, loading, error } = useEventList()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return events
    return events.filter((event) =>
      [event.title, event.location, event.time, event.endTime ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [events, q])

  const renderRow = (event: Event) => (
    <button
      key={event.id}
      type="button"
      onClick={() => onSelect?.(event.id)}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
        event.id === currentId ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper-card font-serif text-[13px] text-ink-muted">
        {event.title.slice(0, 1)}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{event.title}</span>
        <span className="truncate text-[11px] text-ink-muted">
          {[event.time, event.location].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="事件列表">
      <div className="border-b border-line px-3 py-1.5">
        <div className={`flex items-center gap-2 border-b transition-colors ${searchFocused ? 'border-line-hover' : 'border-transparent'}`}>
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索"
            aria-label="搜索事件"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {loading ? <p className="px-2 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-2 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-faint">没有匹配的事件</p>
        ) : null}
        {filtered.map(renderRow)}
      </div>
    </div>
  )
}
