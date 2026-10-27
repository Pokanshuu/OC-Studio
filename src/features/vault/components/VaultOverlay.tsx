'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { ICON_BTN, PAGE_TITLE, PANEL } from '@/lib/ui-tokens'

// ── Vault 浮层外壳 ──────────────────────────────────────────────────────
// 三条硬规则：Portal 到 #overlay-root、极小圆角（PANEL 自带 8px）、无阴影（靠半透明 + 模糊分层）。
//
// 进场用 CSS 动画而不是「mounted + visible」状态机：后者必须在 effect 里
// 同步 setState 才能启动过渡，会触发 React 的 cascading render 警告。
// 代价是没有退出动画 —— 模态直接卸载，体感上没有损失。

interface VaultOverlayProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  /** 底部操作区 */
  footer?: ReactNode
  /** 面板最大宽度 class（默认 md） */
  widthClass?: string
  children: ReactNode
}

export function VaultOverlay({
  open,
  title,
  description,
  onClose,
  footer,
  widthClass = 'max-w-lg',
  children,
}: VaultOverlayProps) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const portalTarget = document.getElementById('overlay-root')
  if (portalTarget === null) return null

  return createPortal(
    <div
      className="overlay-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ pointerEvents: 'auto' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/15" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${PANEL} overlay-panel relative z-10 flex max-h-[80vh] w-full flex-col ${widthClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 className={PAGE_TITLE}>{title}</h2>
            {description !== undefined ? (
              <p className="mt-1 truncate text-[13px] text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className={ICON_BTN} aria-label="关闭">
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer !== undefined ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    portalTarget,
  )
}
