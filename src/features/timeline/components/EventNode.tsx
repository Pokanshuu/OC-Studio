'use client'

/*
 * `react-hooks/refs` 在这里是 dnd-kit 的规定用法：`setNodeRef` / `listeners` /
 * `attributes` 必须在渲染时挂到节点上，不是我们自己在渲染里读 ref。
 */
/* eslint-disable react-hooks/refs */

import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { minBarWidth } from '../constants'
import type { TimelineEvent } from '../types'

/** 块内两行：标题 + 详情（时间 · 参与者）。简 / 详共用同一份，避免两处抄样式。 */
function EventNodeContent({
  event,
  detail,
  participants,
}: {
  event: TimelineEvent
  detail: boolean
  participants?: string
}) {
  const meta = detail && event.kind !== 'birth' ? [event.time, participants].filter(Boolean).join(' · ') : ''
  return (
    <>
      {event.kind === 'birth' ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full border border-ink-faint" />
      ) : event.isMajor ? (
        <span className="h-3 shrink-0 bg-ink" style={{ width: 3 }} aria-hidden />
      ) : null}
      {/*
        标题**吸附在视口最左**（`sticky left-2`）：长条事件往左滚出屏幕时，名字还留在
        可见区左缘，否则「这一条是什么」就随着条子的左端一起滚没了。
        `flex-1` 让这一列铺满条子剩下的宽度 —— sticky 只能在自己的包含块里滑，
        列只有文字那么宽的话，条子滚过去两步它就滑不动了。
      */}
      <span className="sticky left-2 flex min-w-0 flex-1 flex-col justify-center">
        <span className={`truncate ${event.isMajor ? 'font-medium' : ''}`}>{event.title}</span>
        {meta ? <span className="mt-0.5 truncate text-[11px] leading-none text-ink-muted">{meta}</span> : null}
      </span>
    </>
  )
}

export const DraggableNode = memo(function DraggableNode({
  event,
  x,
  y,
  width,
  onSelect,
  detail = false,
  participants,
  selected = false,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
  detail?: boolean
  participants?: string
  selected?: boolean
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
  const tall = detail && event.kind !== 'birth'

  return (
    // 不加 touch-feedback：拖动本体 / 拖右边缘调时长时按下去会整体缩一圈，跟手势冲突
    <div
      ref={bodyDrag.setNodeRef}
      className={`absolute flex items-center gap-1.5 rounded-item border bg-[var(--oc-hover)] px-2 py-1 text-sm text-ink transition-colors ${
        isRange ? 'bg-paper-card' : ''
      } ${selected ? 'border-ink' : 'border-transparent hover:border-line-hover'}`}
      style={{
        left: x + dragDelta,
        top: y,
        width: barWidth,
        height: tall ? 44 : 32,
      }}
      {...bodyDrag.listeners}
      {...bodyDrag.attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(event.id)
      }}
      title={event.summary || event.title}
    >
      <EventNodeContent event={event} detail={detail} participants={participants} />
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
  detail = false,
  participants,
  selected = false,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
  detail?: boolean
  participants?: string
  selected?: boolean
}) {
  const isRange = !!event.endTime
  const tall = detail && event.kind !== 'birth'
  return (
    <div
      className={`touch-feedback absolute flex items-center gap-1.5 rounded-item border bg-[var(--oc-hover)] px-2 py-1 text-sm text-ink transition-colors ${
        isRange ? 'bg-paper-card' : ''
      } ${selected ? 'border-ink' : 'border-transparent hover:border-line-hover'}`}
      style={{
        left: x,
        top: y,
        width: isRange ? width : undefined,
        height: tall ? 44 : 32,
      }}
      title={event.summary || event.title}
      onClick={() => onSelect(event.id)}
    >
      <EventNodeContent event={event} detail={detail} participants={participants} />
    </div>
  )
})
