'use client'

import { Circle } from 'lucide-react'
import type { Event } from '@/types'
import { formatRelativeTime } from '../utils'
import { resolveImageUrl } from '@/lib/image-service'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useLongPress } from '@/lib/useLongPress'
import { formatTimeDisplay } from './event-list-utils'
import { ROUND_MEDIA } from '@/lib/ui-tokens'

interface EventItemProps {
  event: Event
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
}

/** 「画廊」视图的卡片 */
export function EventCard({
  event,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
}: EventItemProps) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(event.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_MEDIA}`}
      >
        <div className="relative aspect-[3/2] w-full bg-paper-card">
          {event.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(event.headerUrl, 'header')}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint">
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
}: EventItemProps) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(event.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event.id)}
      onKeyDown={handleKeyDown}
      className="group relative flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]"
      {...longPress}
    >
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
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(event.id)} />
        </div>
      ) : null}
    </div>
  )
}
