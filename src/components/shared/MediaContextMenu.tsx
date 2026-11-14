'use client'

/**
 * 图片 / 媒体卡片 / 列表项的统一点击坐标菜单。
 *
 * 口径：**单击看大图（或打开），桌面右键 / 移动端长按出菜单**（入口见 `lib/use-media-menu.ts`）。
 * 菜单项由调用方给；定位 / Portal / 点外关闭 / Escape 全部交给 `MenuSurface`。
 *
 * 支持**一层子菜单**（`submenu`）：「移到文件夹」这类动作的选项数量由用户数据决定，
 * 摊平进主菜单会把它撑成一张长表。子菜单用纯 CSS 悬停展开（`group/sub`）——
 * 这里不需要计时器，也不需要再量一次坐标。
 */
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { MENU, MENU_ITEM_BASE } from '@/lib/ui-tokens'
import { MenuSurface } from './menu/MenuSurface'

export interface MediaMenuItem {
  label: string
  onSelect?: () => void
  danger?: boolean
  icon?: ReactNode
  /** 子菜单（只支持一层） */
  submenu?: MediaMenuItem[]
}

function itemClass(danger: boolean | undefined): string {
  return `${MENU_ITEM_BASE} ${danger ? 'text-error hover:bg-error-light' : 'text-ink hover:bg-[var(--oc-hover)]'}`
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
      {items.map((item) =>
        item.submenu ? (
          <div key={item.label} className="group/sub relative">
            <button type="button" role="menuitem" aria-haspopup="menu" className={`${itemClass(item.danger)} justify-between`}>
              <span className="flex min-w-0 items-center gap-2">
                {item.icon}
                {item.label}
              </span>
              <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
            </button>
            {/* 子菜单：悬停到行上从右侧展开（贴着行右缘） */}
            <div className="absolute left-full top-0 hidden pl-0.5 group-hover/sub:block">
              <div className={`${MENU} flex min-w-32 flex-col`}>
                {item.submenu.map((child) => (
                  <button
                    key={child.label}
                    type="button"
                    role="menuitem"
                    className={itemClass(child.danger)}
                    onClick={() => {
                      onClose()
                      child.onSelect?.()
                    }}
                  >
                    {child.icon}
                    {child.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={itemClass(item.danger)}
            onClick={() => {
              onClose()
              item.onSelect?.()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ),
      )}
    </MenuSurface>
  )
}
