'use client'

/**
 * 图片 / 媒体卡片的统一菜单。
 *
 * 口径：**单击看大图，桌面右键 / 移动端长按出菜单**（入口见 `lib/use-media-menu.ts`）。
 * 菜单项由调用方给；定位 / Portal / 点外关闭 / Escape 全部交给 `MenuSurface`。
 */
import type { ReactNode } from 'react'
import { MENU_ITEM_BASE } from '@/lib/ui-tokens'
import { MenuSurface } from './menu/MenuSurface'

export interface MediaMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
}

export function MediaContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number }
  items: MediaMenuItem[]
  onClose: () => void
}) {
  return (
    <MenuSurface at={at} onClose={onClose} className="min-w-32">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`${MENU_ITEM_BASE} ${
            item.danger ? 'text-error hover:bg-error-light' : 'text-ink hover:bg-[var(--oc-hover)]'
          }`}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </MenuSurface>
  )
}
