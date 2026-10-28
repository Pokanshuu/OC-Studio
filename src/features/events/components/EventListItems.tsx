'use client'

import { Circle } from 'lucide-react'
import type { Event } from '@/types'
import { formatRelativeTime } from '../utils'
import { resolveImageUrl } from '@/lib/image-service'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useLongPress } from '@/lib/useLongPress'
import { formatTimeDisplay } from './event-list-utils'
import { DRAG_SLOT_CARD, DRAG_SLOT_ROW, MEDIA_CARD, MEDIA_FALLBACK, MEDIA_GRADIENT, MEDIA_IMG, ROUND_ITEM, ROW_ACTIONS } from '@/lib/ui-tokens'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'

interface EventItemProps {
  event: Event
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
  /** 手动排序模式下才挂拖拽手柄 */
  sortable?: boolean
}

/** 「画廊」视图的卡片 */
export function EventCard({
  event,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: EventItemProps) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(event.id, !sortable)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group touch-feedback"
      {...longPress}
    >
      {sortable ? (
        <div className={DRAG_SLOT_CARD}>
          <DragHandle tone="overlay" handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      <button
        onClick={() => onSelect(event.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_ITEM}`}
      >
        <div className={MEDIA_CARD}>
          {event.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(event.headerUrl, 'header')}
                alt=""
                className={MEDIA_IMG}
              />
              <div className={MEDIA_GRADIENT} />
            </>
          ) : (
            <div className={MEDIA_FALLBACK}>
              {event.title.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 p-2.5">
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

      {!isMobile ? (
        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(event.id)} />
        </div>
      ) : null}
    </div>
  )
}

/** 「目录」视图的行 */
export function EventRow({
  event,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: EventItemProps) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(event.id, !sortable)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(event.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-4 rounded-item py-3 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'}`}
      {...longPress}
    >
      {sortable ? (
        <div className={DRAG_SLOT_ROW}>
          <DragHandle handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {event.isMajor ? (
            <Circle size={8} fill="var(--color-error)" className="shrink-0 text-error" />
          ) : null}
          <h3 className="truncate text-sm font-medium text-ink">{event.title}</h3>
        </div>
        <span className="text-xs text-ink-faint">
          {event.time ? <span>{formatTimeDisplay(event)} · </span> : null}
          编辑于 {formatRelativeTime(event.updatedAt)}
        </span>
      </div>
      {event.summary ? (
        <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">{event.summary}</p>
      ) : null}
      {!isMobile ? (
        <div className={ROW_ACTIONS}>
          <DeleteButton onDelete={() => onDelete(event.id)} />
        </div>
      ) : null}
    </div>
  )
}
