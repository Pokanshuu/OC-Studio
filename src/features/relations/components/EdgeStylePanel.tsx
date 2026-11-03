'use client'

/**
 * 边的样式面板（W4 面板）：改颜色 / 改箭头。
 *
 * 数据是边上的 `color` / `arrow`（`docs/关系图.md` §2.1），写回走 `updateEdgeStyle`。
 * 面板本身**不持有真源**：选完立刻落库，刷新的边会带着新值回来。
 */
import { X } from 'lucide-react'
import { RELATION_ARROWS, RELATION_COLORS, relationColorValue, type RelationArrow } from '@/lib/relation-colors'
import { BTN_QUIET, ICON_BTN, MENU, MENU_GROUP_LABEL, ROUND_ITEM } from '@/lib/ui-tokens'

export interface EdgeStyleSelection {
  /** 边所属的起点实体（React Flow 的 source 节点） */
  sourceType: 'character' | 'event'
  sourceId: number
  targetType: 'character' | 'event'
  targetId: number
  relation: string
  color?: string
  arrow?: RelationArrow
}

export function EdgeStylePanel({
  selection,
  onChange,
  onClose,
  anchor,
}: {
  selection: EdgeStyleSelection
  onChange: (patch: { color?: string | null; arrow?: RelationArrow | null }) => void
  onClose: () => void
  /** 屏幕坐标（面板浮在点击处） */
  anchor: { x: number; y: number }
}) {
  const currentColor = selection.color ?? ''
  const currentArrow = selection.arrow ?? 'none'

  return (
    <div
      className={`${MENU} fixed z-50 w-56 p-2`}
      style={{ left: anchor.x, top: anchor.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className={MENU_GROUP_LABEL}>{selection.relation || '关系'}</span>
        <button type="button" onClick={onClose} className={ICON_BTN} aria-label="关闭">
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1 px-1 py-1">
        {RELATION_COLORS.map((color) => {
          const active = color.name === currentColor
          return (
            <button
              key={color.name}
              type="button"
              title={color.name}
              onClick={() => onChange({ color: color.name })}
              className={`h-5 w-5 ${ROUND_ITEM} border ${active ? 'border-ink' : 'border-line'}`}
              style={{ backgroundColor: relationColorValue(color.name) }}
            />
          )
        })}
      </div>

      <div className="flex flex-col gap-0.5 px-1 pt-1">
        {RELATION_ARROWS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange({ arrow: option.value })}
            className={`flex items-center justify-between px-1.5 py-1 text-[12px] transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM} ${
              option.value === currentArrow ? 'text-ink' : 'text-ink-muted'
            }`}
          >
            <span>{option.label}</span>
            <span className="tabular-nums">{option.glyph}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 border-t border-line pt-1">
        <button type="button" onClick={() => onChange({ color: null, arrow: null })} className={`${BTN_QUIET} w-full justify-center`}>
          恢复默认
        </button>
      </div>
    </div>
  )
}
