'use client'

import { Circle } from 'lucide-react'
import type { Event } from '@/types'
import { formatRelativeTime } from '../utils'
import { resolveImageUrl } from '@/lib/image-service'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { CoverCard } from '@/components/shared/cover/CoverCard'
import { useLongPress } from '@/lib/useLongPress'
import { coverExcerpt } from '@/lib/cover'
import { formatTimeDisplay } from './event-list-utils'
import { DRAG_SLOT_ROW, ROW_ACTIONS } from '@/lib/ui-tokens'
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

/** 「画廊」视图的卡片：一张封面（照片 → 渐进模糊 → 色块，事件名与时间落在色块里） */
export function EventCard({
  event,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: EventItemProps) {
  return (
    <CoverCard
      id={event.id}
      title={event.title}
      intro={coverExcerpt(event.summary, 84)}
      meta={event.time ? formatTimeDisplay(event) : undefined}
      imageSrc={event.headerUrl ? resolveImageUrl(event.headerUrl, 'header') : undefined}
      marker={
        event.isMajor ? (
          <Circle size={7} strokeWidth={0} fill="currentColor" className="text-error" />
        ) : undefined
      }
      onSelect={() => onSelect(event.id)}
      onLongPress={onLongPress}
      isMobile={isMobile}
      sortable={sortable}
      actions={!isMobile ? <DeleteButton tone="overlay" onDelete={() => onDelete(event.id)} /> : undefined}
    />
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
  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(event.id, !sortable)
  // 长按拖动和「长按动作表」抢同一个手势：排序模式下让拖动赢
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(event.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={longPressSort ? { ...style, touchAction: 'none' } : style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-4 rounded-item py-3 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'}`}
      {...longPress}
      {...cardAttributes}
      {...cardListeners}
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
