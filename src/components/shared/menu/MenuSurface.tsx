'use client'

/**
 * 按点击坐标弹出的菜单 —— **唯一实现**（S2）。
 *
 * 职责：Portal 到 `#overlay-root`、量宽高后夹进视口（`adjustContextMenuPosition`）、
 * 点外部 / Escape 关闭（`useDismissableLayer`）、`MENU` 容器。
 * 内容与语义由调用方给（媒体菜单 / 边样式面板 / 移到文件夹 / 文件夹条）。
 *
 * 结构固定为两层：
 * - 根 `pointer-events-none fixed inset-0 z-50`：**透明**，不接事件，所以点外部能穿透到页面
 *   （点另一张图就是「关菜单 + 开大图」，而不是被这层吃掉）
 * - 面板 `MENU pointer-events-auto absolute`：菜单本体，接事件
 *
 * 与 `ContextMenu` 的边界（本轮不合并）：
 * - `ContextMenu` 只服务编辑器正文 / 选区的右键：带子菜单（再 Portal 一层）、
 *   选区变化自动收起、150ms 淡入淡出与 100/300ms 冷却，事件模型与这里不同；
 * - 其余「按点击坐标弹菜单」一律走这里，不要再复制 portal / measure / outside-click 代码。
 */
import { useLayoutEffect, useState, type AriaRole, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MENU } from '@/lib/ui-tokens'
import { adjustContextMenuPosition } from '@/lib/menu-utils'
import { useDismissableLayer } from '@/lib/use-dismissable-layer'

interface MenuSurfaceProps {
  /** 点击处（视口坐标） */
  at: { x: number; y: number }
  onClose: () => void
  children: ReactNode
  className?: string
  role?: AriaRole
  /** 面板固定宽度（px）；宽度由内容决定时不传 */
  width?: number
  ariaLabel?: string
}

export function MenuSurface({
  at,
  onClose,
  children,
  className = '',
  role = 'menu',
  width,
  ariaLabel,
}: MenuSurfaceProps) {
  const [position, setPosition] = useState(at)
  const panelRef = useDismissableLayer<HTMLDivElement>({ onClose })

  // 量出真实宽高再夹进视口：直接 left/top 会让右下角弹出的菜单飞出屏幕
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition(adjustContextMenuPosition(at.x, at.y, rect.width, rect.height))
  }, [at.x, at.y, panelRef])

  // 菜单只在用户点击后出现（`at` 有值），SSR / 水合时不会渲染
  if (typeof document === 'undefined') return null
  const root = document.getElementById('overlay-root') ?? document.body

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50">
      <div
        ref={panelRef}
        role={role}
        aria-label={ariaLabel}
        // 菜单里的点击不回到页面（卡片 / 行常常整块可点）
        onClick={(event) => event.stopPropagation()}
        className={`${MENU} pointer-events-auto absolute flex flex-col ${className}`}
        style={{ left: position.x, top: position.y, ...(width ? { width } : {}) }}
      >
        {children}
      </div>
    </div>,
    root,
  )
}
