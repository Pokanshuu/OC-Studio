'use client'

/**
 * 按点击坐标弹出的**面板** —— 唯一实现。
 *
 * 收口后的分工：
 * - **菜单**（item 数组：媒体右键 / 列表右键 / 编辑器选区 / 输入框 / 分组方式）走 `PointMenu`
 *   （Base UI Menu + 虚拟锚点，带子菜单与菜单语义）；
 * - **面板**（自定义内容：边样式 / 标注颜色 / 箭头方向 / 标签面板）走这里，用 Base UI **Popover**：
 *   里面是色板、滑块、输入框，不是 menu 语义 —— 用 Menu 会把 Tab 当成「关菜单」，
 *   也会把方向键从滑块抢走。
 *
 * Popover 负责：Portal 到 `#overlay-root`、贴边翻转 / 夹进视口（`collisionPadding`）、
 * 点外部**按下即关**、Escape 关闭。
 * 键盘导航（↑↓ 在 `role="menuitem"` 之间走）保留原来的 `useMenuKeyboard`：
 * 这几个面板里确实有一排可选项，换实现不该把这个功能弄丢。
 */
import { useMemo, useRef, type AriaRole, type ReactNode } from 'react'
import { Popover } from '@base-ui/react/popover'
import { MENU } from '@/lib/ui-tokens'
import { useMenuKeyboard } from '@/lib/use-menu-keyboard'

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
  // 面板的键盘导航（打开后焦点进第一项、↑/↓ 走、Enter 执行、Esc 关闭并归还焦点）
  const panelRef = useRef<HTMLDivElement>(null)
  useMenuKeyboard(panelRef, onClose)

  // 虚拟锚点：落在点击处、零尺寸 —— Positioner 拿它做贴边翻转
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) }),
    [at.x, at.y],
  )

  const container =
    typeof document === 'undefined'
      ? undefined
      : document.getElementById('overlay-root') ?? document.body

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Popover.Portal container={container}>
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={0}
          positionMethod="fixed"
          collisionPadding={8}
          className="z-[99999]"
        >
          <Popover.Popup
            ref={panelRef}
            role={role}
            aria-label={ariaLabel}
            // 焦点与键盘由 useMenuKeyboard 接管（与替换前一致）
            initialFocus={false}
            finalFocus={false}
            onClick={(event) => event.stopPropagation()}
            className={`${MENU} pointer-events-auto ${className}`}
            style={width ? { width } : undefined}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
