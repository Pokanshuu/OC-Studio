'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE, ROUND_ITEM } from '@/lib/ui-tokens'
import type { Event } from '@/types'
import { useEventList } from '../hooks/useEvents'

interface EventEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
  onCollapse: () => void
  onCreate?: () => void
}

/** 三栏左栏：搜索 + 事件行（标题 + 时间/地点）。不复制列表页的卡片/视图切换。 */
export function EventEditorList({ currentId, onSelect, onCollapse, onCreate }: EventEditorListProps) {
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

  const renderRow = (event: Event) => {
    const subtitle = [event.time, event.location].filter(Boolean).join(' · ')
    return (
      <button
        key={event.id}
        type="button"
        onClick={() => onSelect?.(event.id)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
          event.id === currentId ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink hover:bg-[var(--oc-hover)]'
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper-card font-serif text-[13px] text-ink-muted">
          {event.title.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-ink">{event.title}</span>
          {subtitle ? <span className="truncate text-[11px] text-ink-muted">{subtitle}</span> : null}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper-alt" aria-label="事件列表">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onCollapse}
            className={ICON_BTN_MD}
            title="收起列表"
            aria-label="收起列表"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>事件</h2>
        </div>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className={ICON_BTN_MD}
            title="新建事件"
            aria-label="新建事件"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-line px-3 py-1.5">
        <div className={`flex items-center gap-2 border-b transition-colors ${searchFocused ? 'border-line-hover' : 'border-transparent'}`}>
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索事件…"
            aria-label="搜索事件"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {loading ? <p className="px-3 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-3 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-faint">没有匹配的事件</p>
        ) : null}
        <nav className="flex flex-col gap-1">{filtered.map(renderRow)}</nav>
      </div>
    </div>
  )
}
