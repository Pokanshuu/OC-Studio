'use client'

import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { minBarWidth } from '../constants'
import type { TimelineEvent } from '../types'

export const DraggableNode = memo(function DraggableNode({
  event,
  x,
  y,
  width,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
}) {
  const bodyDrag = useDraggable({
    id: `event-body-${event.id}`,
    data: { event, startX: x, type: 'move' },
  })

  const leftDrag = useDraggable({
    id: `event-left-${event.id}`,
    data: { event, startX: x, type: 'resize-left' },
  })

  const rightDrag = useDraggable({
    id: `event-right-${event.id}`,
    data: { event, startX: x, type: 'resize-right' },
  })

  const dragDelta = (bodyDrag.transform || leftDrag.transform || rightDrag.transform)?.x ?? 0
  const isRange = !!event.endTime
  const barWidth = isRange ? Math.max(width, minBarWidth) : undefined

  return (
    <div
      ref={bodyDrag.setNodeRef}
      className={`touch-feedback absolute flex items-center gap-1.5 rounded-item border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover ${isRange ? 'bg-ink-muted/10' : ''}`}
      style={{
        left: x + dragDelta,
        top: y,
        width: barWidth,
        height: 32,
      }}
      {...bodyDrag.listeners}
      {...bodyDrag.attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(event.id)
      }}
      title={event.summary || event.title}
    >
      {event.kind === 'birth' ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full border border-ink-faint" />
      ) : event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate sticky left-2">{event.title}</span>
      {isRange ? (
        <>
          <div
            ref={leftDrag.setNodeRef}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
            {...leftDrag.listeners}
            {...leftDrag.attributes}
          />
          <div
            ref={rightDrag.setNodeRef}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
            {...rightDrag.listeners}
            {...rightDrag.attributes}
          />
        </>
      ) : null}
    </div>
  )
})

export const StaticNode = memo(function StaticNode({
  event,
  x,
  y,
  width,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
}) {
  const isRange = !!event.endTime
  return (
    <div
      className={`touch-feedback absolute flex items-center gap-1.5 rounded-item border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover ${isRange ? 'bg-ink-muted/10' : ''}`}
      style={{
        left: x,
        top: y,
        width: isRange ? width : undefined,
        height: 32,
      }}
      title={event.summary || event.title}
      onClick={() => onSelect(event.id)}
    >
      {event.kind === 'birth' ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full border border-ink-faint" />
      ) : event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate sticky left-2">{event.title}</span>
    </div>
  )
})




