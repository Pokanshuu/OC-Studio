'use client'

/**
 * 设置里「一行字段」的唯一实现：手柄 + 可改的名字 + 可选标记 + 删除。
 *
 * 原本有两个几乎一样的副本 —— `FieldSettings`（列型字段表）和
 * `BasicInfoPanel`（基本信息组件）。两份的差异只有中间那个「自建」标记，
 * 但已经各自演化出不同的细节（一个传 label、一个传 key）。同一件事写两遍，
 * 迟早一边改了另一边没改，所以收成一个组件，标记用 `badge` 传入。
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { ICON_BTN } from '@/lib/ui-tokens'

export function SettingsFieldRow({
  id,
  value,
  badge,
  onRename,
  onRemove,
}: {
  /** 拖拽身份：列型传字段 id，组件型传字段键 */
  id: number | string
  value: string
  /** 右侧那个小字标记（「自建」），没有就不传 */
  badge?: string
  onRename: (next: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(value)
  const { setNodeRef, style, attributes, listeners } = useSortableItem(id, false)

  const commit = (): void => {
    const next = draft.trim()
    if (next === '' || next === value) {
      setDraft(value)
      return
    }
    onRename(next)
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
      {badge !== undefined ? <span className="shrink-0 text-[11px] text-ink-faint">{badge}</span> : null}
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
