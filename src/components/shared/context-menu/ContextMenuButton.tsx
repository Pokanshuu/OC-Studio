'use client'

import type { ContextMenuItem } from './context-menu-types'

/** 菜单项按钮（顶层与子菜单共用同一套样式） */
export function ContextMenuButton({
  item,
  onSelect,
}: {
  item: ContextMenuItem
  onSelect: () => void
}) {
  return (
    <button
      disabled={item.disabled}
      onClick={() => {
        item.onClick?.()
        onSelect()
      }}
      className={`flex items-center gap-3 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        item.danger
          ? 'text-error hover:bg-error-light dark:hover:bg-red-950/30'
          : item.disabled
            ? 'text-ink-faint'
            : 'text-ink hover:bg-[var(--oc-hover)]'
      }`}
    >
      <span>{item.label}</span>
      {item.shortcut ? (
        <span className="ml-auto text-xs text-ink-faint">{item.shortcut}</span>
      ) : null}
    </button>
  )
}
