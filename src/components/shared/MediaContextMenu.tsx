'use client'

/**
 * 图片 / 媒体卡片的统一右键菜单（桌面用；手机端仍走长按动作表）。
 *
 * 口径：**单击看大图，右键出菜单**。菜单项由调用方给，位置也由调用方管。
 * 用 `MENU` / `MENU_ITEM` 令牌，Portal 到 `#overlay-root`（约束 6）。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MENU, MENU_ITEM } from '@/lib/ui-tokens'

export interface MediaMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null
  const root = document.getElementById('overlay-root') ?? document.body

  return createPortal(
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className={`${MENU} absolute z-50 flex min-w-32 flex-col`}
        style={{ left: at.x, top: at.y }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`${MENU_ITEM} ${item.danger ? 'text-error' : ''}`}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    root,
  )
}
