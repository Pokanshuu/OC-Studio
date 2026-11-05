'use client'

/**
 * 边的面板：改名 / 改颜色 / 改箭头 / 删除（W4 面板 + 关系图改版）。
 *
 * 数据是边上那一份（`docs/关系图.md` §2.1）：名字与 `color` / `arrow` 都落在
 * 发起方实体的 `relatedCharacters[] / relations[]` 里，写回走 `updateEdgeStyle`。
 * 面板本身**不持有真源**：选完立刻落库，刷新回来的边带着新值。
 *
 * 交互口径：**改一项后面板不关**。选颜色、再选箭头是一次动作里的两下，
 * 选完就关会逼用户重新点那条细线。关闭只走 X / 点外部 / Escape。
 *
 * 三种边在这里各有各的权限（判据见 `types.ts` 的 `GraphEdgeKind`）：
 * - `relation`：能改名、能配色、能删
 * - `member`（属于 / 参与 / 发生于）：名字由字段决定，只能删
 * - `reference`（@ 引用）：正文里推出来的，既不配也不删（面板根本不会为它打开）
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { RELATION_ARROWS, RELATION_COLORS, relationColorValue, type RelationArrow } from '@/lib/relation-colors'
import {
  ICON_BTN,
  MENU_GROUP_LABEL,
  MENU_ITEM_BASE,
} from '@/lib/ui-tokens'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import type { GraphEdgeKind, RelationNodeType } from '../types'

export interface EdgeStyleSelection {
  /** 边所属的起点实体（React Flow 的 source 节点） */
  sourceType: RelationNodeType
  sourceId: number
  targetType: RelationNodeType
  targetId: number
  relation: string
  kind?: GraphEdgeKind
  color?: string
  arrow?: RelationArrow
}

export interface EdgeStylePatchInput {
  color?: string | null
  arrow?: RelationArrow | null
  relation?: string
}

export function EdgeStylePanel({
  selection,
  onChange,
  onDelete,
  canStyle,
  canRename,
  onClose,
  anchor,
}: {
  selection: EdgeStyleSelection
  onChange: (patch: EdgeStylePatchInput) => void
  onDelete: () => void
  /** 能不能配色 / 改箭头（角色↔角色、事件↔事件、笔记↔笔记的命名边有） */
  canStyle: boolean
  /** 能不能改名（成员关系的名字是固定语义，改了就与字段打架） */
  canRename: boolean
  onClose: () => void
  /** 屏幕坐标（面板浮在点击处） */
  anchor: { x: number; y: number }
}) {
  const currentColor = selection.color ?? ''
  // 角色↔角色不写箭头 = 默认双向；这里不能一律按 none 显示，否则面板会与画布不一致
  const characterEdge = selection.sourceType === 'character' && selection.targetType === 'character'
  const currentArrow = selection.arrow ?? (characterEdge ? 'both' : 'none')
  const [draftName, setDraftName] = useState(selection.relation)
  const inputRef = useRef<HTMLInputElement>(null)

  // 外部刷新回来的名字变了（同一个面板还开着）→ 跟着走
  useEffect(() => {
    setDraftName(selection.relation)
  }, [selection.relation])

  const commitName = () => {
    const next = draftName.trim()
    if (next === selection.relation.trim()) return
    if (!next) {
      setDraftName(selection.relation)
      return
    }
    onChange({ relation: next })
  }

  return (
    <MenuSurface at={anchor} onClose={onClose} role="dialog" ariaLabel="关系" width={224}>
      <div className="flex items-center justify-between pl-3 pr-1">
        <span className={MENU_GROUP_LABEL}>{selection.relation || '关系'}</span>
        <button type="button" onClick={onClose} className={ICON_BTN} aria-label="关闭">
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {canRename ? (
        <div className="px-3 pb-1">
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName()
                inputRef.current?.blur()
              }
            }}
            placeholder="关系名"
            aria-label="关系名"
            className="h-6 w-full border-b border-line bg-transparent text-[12px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
          />
        </div>
      ) : null}

      {canStyle ? (
        <>
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
        </>
      ) : null}

      <div className="my-1 border-t border-line" />
      <div className="flex flex-col">
        {canStyle ? (
          <button
            type="button"
            onClick={() => onChange({ color: null, arrow: null })}
            className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
          >
            恢复默认
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className={`${MENU_ITEM_BASE} text-error hover:bg-error-light`}
        >
          <Trash2 size={12} strokeWidth={2} />
          删除这条关系
        </button>
      </div>
    </MenuSurface>
  )
}
