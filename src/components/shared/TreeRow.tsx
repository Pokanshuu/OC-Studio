'use client'

/**
 * 树行的唯一形态（世界观目录 / 小说章节树共用）。
 *
 * 两棵树以前各写一套行样式，hover、行高、缩进、手柄宽度都会漂 —— 这里收成一处：
 * 行高（py-1 + 13px）、缩进（`depth * 12 + 6`）、悬停底色与文字色、拖拽手柄、
 * 展开箭头、双击重命名、右键菜单，全部只有这份实现。
 *
 * 拖拽本身仍由调用方用 `useSortable` 接线（`dragHandle` 传 attributes/listeners），
 * 组件只负责长什么样。
 */

import type { HTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, GripVertical } from 'lucide-react'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { useSortable } from '@dnd-kit/sortable'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

type DragListeners = ReturnType<typeof useSortable>['listeners']

/** 树内联重命名输入框（回车提交 / Esc 取消 / 失焦提交） */
export function InlineEditInput({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
    else onCancel()
  }

  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') onCancel()
        }}
        onBlur={commit}
        className="min-w-0 flex-1 border-b border-line bg-transparent px-0 py-0.5 text-[13px] text-ink focus:border-line-hover focus:outline-none"
      />
    </div>
  )
}

export interface TreeRowProps {
  depth: number
  selected: boolean
  title: string
  /** 行首图标（词条树只给「概念」画，小说每章都画） */
  icon?: ReactNode
  onClick?: () => void
  /** 双击进入重命名（传了才挂） */
  onStartRename?: () => void
  editing?: boolean
  onCommitRename?: (value: string) => void
  onCancelRename?: () => void
  /** 有子级时传：画展开箭头；不传则留同宽占位，缩进才对得齐 */
  expanded?: boolean
  onToggleExpand?: () => void
  /** `useSortable` 的 attributes/listeners；不传 = 不显示拖拽手柄 */
  dragHandle?: { attributes: DraggableAttributes; listeners: DragListeners }
  /** 行尾动作（悬停出现），例如删除按钮 */
  actions?: ReactNode
  /** 右键菜单项 */
  contextMenu?: ContextMenuItem[]
  /** 额外铺到行上的事件（移动端长按等） */
  rowProps?: HTMLAttributes<HTMLDivElement>
}

export function TreeRow({
  depth,
  selected,
  title,
  icon,
  onClick,
  onStartRename,
  editing = false,
  onCommitRename,
  onCancelRename,
  expanded,
  onToggleExpand,
  dragHandle,
  actions,
  contextMenu,
  rowProps,
}: TreeRowProps) {
  const row = (
    <div
      {...rowProps}
      onClick={onClick}
      className={`group flex items-center gap-0.5 rounded-item py-1 text-[13px] transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'bg-[var(--oc-hover)] text-ink'
          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
      }`}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
    >
      {dragHandle ? (
        <span
          {...dragHandle.attributes}
          {...dragHandle.listeners}
          aria-label="拖动排序"
          title="拖动排序"
          className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-ink-faint opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical size={11} strokeWidth={2} />
        </span>
      ) : null}

      {onToggleExpand ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand()
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint"
          aria-label={expanded ? '收起' : '展开'}
        >
          <ChevronRight
            size={13}
            strokeWidth={2}
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      {editing && onCommitRename && onCancelRename ? (
        <InlineEditInput initialValue={title} onSubmit={onCommitRename} onCancel={onCancelRename} />
      ) : (
        <span
          className="flex min-w-0 flex-1 items-center gap-1 truncate pl-0.5 text-[13px]"
          onDoubleClick={onStartRename}
          title={onStartRename ? '双击重命名' : undefined}
        >
          {icon ? <span className="shrink-0 text-ink-faint">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </span>
      )}

      {actions ? (
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  )

  return contextMenu && contextMenu.length > 0 ? (
    <ContextMenu items={contextMenu}>{row}</ContextMenu>
  ) : (
    row
  )
}
