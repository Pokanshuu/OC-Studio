'use client'

/**
 * 时间线的参与者轨道（`docs/时间线.md` §3）。
 *
 * 只画、不算：每行是谁、哪些事件属于这一行由 `TimelineView` 从事件数据算好传进来。
 * 条的长度 = 事件跨度；瞬时事件是 6px 圆点。点条 = 打开事件。
 *
 * 轨道和主轴共用同一个滚动容器，所以 x 直接复用事件块的坐标，
 * 不需要第二套时间换算 —— 否则横向滚动一定会错位。
 */
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { TimelineEvent } from '../types'

export interface ParticipantTrackItem {
  event: TimelineEvent
  x: number
  width: number
}

export interface ParticipantTrackRow {
  key: string
  label: string
  kind: 'character' | 'country' | 'unassigned' | 'more'
  items: ParticipantTrackItem[]
  /** `kind === 'more'`：当前是展开还是收起 */
  expanded?: boolean
}

export const TRACK_ROW_HEIGHT = 22
const BAR_HEIGHT = 2
const DOT_SIZE = 6

export function ParticipantTracks({
  rows,
  top,
  onSelect,
  onOpen,
  selectedEventId,
  onToggleMore,
}: {
  rows: readonly ParticipantTrackRow[]
  /** 轨道区在画布里的绝对 y */
  top: number
  /** 单击：选中并把事件块滚进视野（不跳走） */
  onSelect: (eventId: number) => void
  /** 双击：打开事件编辑器 */
  onOpen?: (eventId: number) => void
  /** 被选中的事件：参与条换成墨色 */
  selectedEventId: number | null
  /** 「角色（N）」这一行的展开 / 收起 */
  onToggleMore?: () => void
}) {
  if (rows.length === 0) return null

  return (
    <div className="absolute left-0 right-0" style={{ top, height: rows.length * TRACK_ROW_HEIGHT }}>
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="absolute left-0 right-0"
          style={{ top: index * TRACK_ROW_HEIGHT, height: TRACK_ROW_HEIGHT }}
        >
          {row.kind === 'more' ? (
            <button
              type="button"
              onClick={onToggleMore}
              className="sticky left-2 z-10 inline-flex max-w-[140px] items-center gap-1 bg-paper/85 px-1 text-[11px] leading-[22px] text-ink-muted backdrop-blur transition-colors hover:text-ink"
            >
              <span className="truncate">{row.label}</span>
              {row.expanded ? <ChevronUp size={11} strokeWidth={2} /> : <ChevronDown size={11} strokeWidth={2} />}
            </button>
          ) : (
            <span className="sticky left-2 z-10 inline-block max-w-[88px] truncate bg-paper/85 px-1 text-[11px] leading-[22px] text-ink-faint backdrop-blur">
              {row.label}
            </span>
          )}
          {row.kind === 'more'
            ? null
            : row.items.map((item) => {
                const instant = !item.event.endTime
                const selected = item.event.id === selectedEventId
                return (
                  <button
                    key={`${row.key}-${item.event.id}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(item.event.id)}
                    onDoubleClick={() => onOpen?.(item.event.id)}
                    title={item.event.title}
                    aria-label={`${row.label}：${item.event.title}`}
                    className="absolute rounded-full"
                    style={{
                      left: item.x,
                      width: instant ? DOT_SIZE : Math.max(item.width, DOT_SIZE),
                      height: instant ? DOT_SIZE : BAR_HEIGHT,
                      top: instant ? 8 : 10,
                      background: selected ? 'var(--oc-ink)' : 'var(--color-line-hover)',
                    }}
                  />
                )
              })}
        </div>
      ))}
    </div>
  )
}
