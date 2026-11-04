'use client'

/**
 * 边的样式面板（W4 面板）：改颜色 / 改箭头。
 *
 * 数据是边上的 `color` / `arrow`（`docs/关系图.md` §2.1），写回走 `updateEdgeStyle`。
 * 面板本身**不持有真源**：选完立刻落库，刷新的边会带着新值回来。
 *
 * 交互口径：**改一项后面板不关**。选颜色、再选箭头是一次动作里的两下，
 * 选完就关会逼用户重新点那条细线。关闭只走 X / 点外部 / Escape。
 * Portal / 贴边翻转 / 点外关闭由 `MenuSurface` 统一处理。
 */
import { Check, X } from 'lucide-react'
import { RELATION_ARROWS, RELATION_COLORS, relationColorValue, type RelationArrow } from '@/lib/relation-colors'
import {
  BTN_QUIET,
  ICON_BTN,
  MENU_GROUP_LABEL,
  MENU_ITEM_BASE,
} from '@/lib/ui-tokens'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'

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
    <MenuSurface
      at={anchor}
      onClose={onClose}
      role="dialog"
      ariaLabel="关系线样式"
      width={224}
    >
      <div className="flex items-center justify-between pl-3 pr-1">
        <span className={MENU_GROUP_LABEL}>{selection.relation || '关系'}</span>
        <button type="button" onClick={onClose} className={ICON_BTN} aria-label="关闭">
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* 12 档边色：圆形色点，选中 = 墨色圆环（与标签色板同一套语言） */}
      <div className="grid grid-cols-6 gap-1.5 px-3 py-2">
        {RELATION_COLORS.map((color) => {
          const active = color.name === currentColor
          return (
            <button
              key={color.name}
              type="button"
              title={color.name}
              aria-label={color.name}
              aria-pressed={active}
              onClick={() => onChange({ color: color.name })}
              className={`h-5 w-5 rounded-full border transition-colors ${
                active ? 'border-ink' : 'border-transparent hover:border-line-hover'
              }`}
              style={{ backgroundColor: relationColorValue(color.name) }}
            />
          )
        })}
      </div>

      <div className="flex flex-col">
        {RELATION_ARROWS.map((option) => {
          const active = option.value === currentArrow
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ arrow: option.value })}
              className={`${MENU_ITEM_BASE} justify-between ${
                active
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {option.label}
                {active ? <Check size={12} strokeWidth={2} className="text-ink-faint" /> : null}
              </span>
              <span className="tabular-nums">{option.glyph}</span>
            </button>
          )
        })}
      </div>

      <div className="my-1 border-t border-line" />
      <div className="px-1 pb-1">
        <button
          type="button"
          onClick={() => onChange({ color: null, arrow: null })}
          className={`${BTN_QUIET} w-full justify-center`}
        >
          恢复默认
        </button>
      </div>
    </MenuSurface>
  )
}
