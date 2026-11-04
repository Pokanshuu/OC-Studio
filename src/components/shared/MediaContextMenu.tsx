'use client'

/**
 * 图片 / 媒体卡片的统一右键菜单（桌面用；手机端仍走长按动作表）。
 *
 * 口径：**单击看大图，右键出菜单**。菜单项由调用方给。
 * 定位 / Portal / 点外关闭 / Escape 全部交给 `MenuSurface`（S2），这里只保留菜单项语义。
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
