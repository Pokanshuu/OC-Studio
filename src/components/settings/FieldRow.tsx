'use client'

/**
 * 设置里「一行字段」的唯一实现：手柄 + 可改的名字 + 可选标记 + 删除。
 *
 * 原本有两个几乎一样的副本 —— `FieldSettings`（列型字段表）和
 * `BasicInfoPanel`（基本信息组件）。两份的差异只有中间那个「自建」标记，
 * 但已经各自演化出不同的细节（一个传 label、一个传 key）。同一件事写两遍，
 * 迟早一边改了另一边没改，所以收成一个组件，标记用 `badge` 传入。
 */
import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { ICON_BTN } from '@/lib/ui-tokens'

export function SettingsFieldRow({
  id,
  value,
  badge,
  keyValue,
  onKeyChange,
  typeSlot,
  onRename,
  onRemove,
}: {
  /** 拖拽身份：列型传字段 id，组件型传字段键 */
  id: number | string
  value: string
  /** 右侧那个小字标记（「自建」），没有就不传 */
  badge?: string
  /** 落盘用的键（给了才显示第二个输入框；显示名可以跟它不同） */
  keyValue?: string
  onKeyChange?: (next: string) => void
  /** 名称右边的控件（基本信息组件的「单行 / 数字 / 日期 / 开关」选择） */
  typeSlot?: ReactNode
  onRename: (next: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [keyDraft, setKeyDraft] = useState(keyValue ?? value)
  /** 落盘键默认折叠：显示名与键名相同时不摆第二个输入框（两列同样的字只是噪声） */
  const [editingKey, setEditingKey] = useState(false)
  const { setNodeRef, style, attributes, listeners } = useSortableItem(id, false)

  const commit = (): void => {
    const next = draft.trim()
    if (next === '' || next === value) {
      setDraft(value)
      return
    }
    onRename(next)
  }

  const commitKey = (): void => {
    if (onKeyChange === undefined) return
    const next = keyDraft.trim()
    if (next === '' || next === keyValue) {
      setKeyDraft(keyValue ?? value)
      return
    }
    onKeyChange(next)
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 border-b border-line py-1 last:border-b-0">
      <DragHandle handleProps={{ attributes, listeners }} />
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(value)
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
      />
      {onKeyChange !== undefined ? (
        editingKey ? (
          <input
            autoFocus
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            onBlur={() => {
              commitKey()
              setEditingKey(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setKeyDraft(keyValue ?? value)
                setEditingKey(false)
              }
            }}
            title="落盘键（frontmatter 里的键名）"
            aria-label="落盘键"
            className="w-20 shrink-0 bg-transparent text-[11px] text-ink-faint placeholder:text-ink-faint focus:text-ink focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setKeyDraft(keyValue ?? value)
              setEditingKey(true)
            }}
            title="落盘键"
            className="shrink-0 px-1 text-[11px] text-ink-faint transition-colors hover:text-ink"
          >
            {keyValue !== undefined && keyValue !== value ? keyValue : '#'}
          </button>
        )
      ) : null}
      {badge !== undefined ? <span className="shrink-0 text-[11px] text-ink-faint">{badge}</span> : null}
      {typeSlot}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`删除字段「${value}」`}
        className={`${ICON_BTN} hover:text-error`}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
