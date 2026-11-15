'use client'

/**
 * 按点击坐标弹出的菜单 —— **唯一实现**（Base UI Menu + 虚拟锚点）。
 *
 * 以前这一层是自绘的（`MenuSurface` + `useMenuKeyboard`）：定位靠量 `getBoundingClientRect`
 * 再自己夹进视口，键盘靠 DOM 里找 `role="menuitem"`，子菜单只能悬停展开、键盘进不去。
 * 现在交给 Base UI Menu：`Positioner.anchor` 传一个「落在点击坐标上、零尺寸」的虚拟元素，
 * 贴边翻转 / 夹进视口 / 焦点圈 / ↑↓ Home End / → 进子菜单 / ← 返回 / Esc 逐层关 / Enter 确认
 * 全部是库的原生行为。
 *
 * 与 `MenuSurface` 的分工：这里只服务**菜单**（item 数组）；`MenuSurface` 留给
 * 「按坐标弹出的表单面板」（边样式 / 标注颜色 / 箭头方向 / 标签面板），
 * 它们里面是滑块和输入框，不是 menu 语义，套 Menu 会把 Tab 当成「关闭菜单」。
 *
 * 关闭时的 150ms 淡出：`data-ending-style` 由 Base UI 在 `open` 变 false 时挂上，
 * 但调用点都是 `{at ? <XxxMenu/> : null}` —— 父组件一 `setAt(null)` 就把整棵树卸了，
 * `data-ending-style` 还没来得及播。所以这里的关法是：**自己先置 closing 播淡出，
 * 150ms 后才回调 `onClose`**（父组件那时候再卸载）。时长与 `--oc-duration-fast` 对齐。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { shortcutLabel } from '@/lib/shortcut-label'
import { MENU, MENU_ITEM_BASE } from '@/lib/ui-tokens'

/** 淡出时长（ms）：与 globals.css 的 `--oc-duration-fast` = 150ms 一致 */
const FADE_MS = 150

/** 菜单浮层：`MENU` 皮肤 + 只在关闭时淡出（进场保持「点开就在」，不拖） */
const POPUP = `${MENU} pointer-events-auto z-50 flex flex-col select-none outline-none transition-opacity duration-fast ease-quiet data-ending-style:opacity-0`

/** 定位层必须有 z-index：`#overlay-root` 里的浮层靠它排队 */
const POSITIONER = 'z-[99999]'

export interface PointMenuItem {
  /** 行文字（分隔线不需要） */
  label?: string
  onSelect?: () => void
  icon?: ReactNode
  /** 快捷键提示（显示用，不参与判定） */
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  /** 当前项打勾（「移到文件夹」的当前夹 / 单选列表） */
  checked?: boolean
  /** 子菜单（可以有多层） */
  submenu?: PointMenuItem[]
  /** 分隔线：`{ separator: true }` */
  separator?: boolean
  /** 单行附加类名（各调用点的小差异，比如默认文字色） */
  className?: string
}

interface PointMenuProps {
  /** 点击处（视口坐标）；调用方保证「打开前就量好」，不会先画在 (0,0) */
  at: { x: number; y: number }
  items: PointMenuItem[]
  /** 淡出播完后才回调 —— 调用方在这里把 `at` 置空卸载 */
  onClose: () => void
  minWidth?: number
  width?: number
  ariaLabel?: string
  /** 所有行的附加类名（比如「移到文件夹」整张表都是次要色） */
  itemClassName?: string
}

function rowClass(item: PointMenuItem, itemClassName?: string): string {
  return cn(
    MENU_ITEM_BASE,
    'select-none',
    item.danger
      ? 'text-error data-highlighted:bg-error-light'
      : item.disabled
        ? 'text-ink-faint'
        : 'text-ink data-highlighted:bg-[var(--oc-hover)]',
    itemClassName,
    item.className,
  )
}

function RowContent({ item }: { item: PointMenuItem }) {
  const hasSubmenu = (item.submenu?.length ?? 0) > 0
  return (
    <>
      {item.checked !== undefined ? (
        <Check
          size={12}
          strokeWidth={2}
          aria-hidden
          className={cn('shrink-0', item.checked ? 'text-ink' : 'text-transparent')}
        />
      ) : item.icon ? (
        <span className="flex shrink-0 items-center" aria-hidden>
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{item.label}</span>
      {item.shortcut ? (
        <span className="ml-auto pl-4 text-caption text-ink-faint">{shortcutLabel(item.shortcut)}</span>
      ) : hasSubmenu ? (
        <ChevronRight size={13} strokeWidth={2} aria-hidden className="ml-auto shrink-0 text-ink-faint" />
      ) : null}
    </>
  )
}

function stopMenuClick(event: React.MouseEvent): void {
  // 菜单里的点击不回到页面：卡片 / 行常常整块可点
  event.stopPropagation()
}

/** 子菜单：→ 展开、← 返回、Esc 只关这一层（Base UI 的原生行为） */
function SubmenuRow({
  item,
  container,
  itemClassName,
}: {
  item: PointMenuItem
  container: HTMLElement | undefined
  itemClassName?: string
}) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger
        disabled={item.disabled}
        label={item.label}
        className={rowClass(item, itemClassName)}
      >
        <RowContent item={item} />
      </Menu.SubmenuTrigger>
      <Menu.Portal container={container}>
        <Menu.Positioner
          side="right"
          align="start"
          alignOffset={-4}
          sideOffset={2}
          positionMethod="fixed"
          collisionPadding={8}
          className={POSITIONER}
        >
          <Menu.Popup className={cn(POPUP, 'min-w-32')} onClick={stopMenuClick}>
            <MenuRows items={item.submenu ?? []} container={container} itemClassName={itemClassName} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  )
}

function MenuRows({
  items,
  container,
  itemClassName,
}: {
  items: PointMenuItem[]
  container: HTMLElement | undefined
  itemClassName?: string
}) {
  return (
    <>
      {items.map((item, index) => {
        const key = `${item.label ?? 'sep'}-${index}`
        if (item.separator) {
          return <Menu.Separator key={key} className="mx-2 my-1 h-px bg-line" />
        }
        if ((item.submenu?.length ?? 0) > 0) {
          return (
            <SubmenuRow key={key} item={item} container={container} itemClassName={itemClassName} />
          )
        }
        return (
          <Menu.Item
            key={key}
            label={item.label}
            disabled={item.disabled}
            onClick={() => item.onSelect?.()}
            className={rowClass(item, itemClassName)}
          >
            <RowContent item={item} />
          </Menu.Item>
        )
      })}
    </>
  )
}

export function PointMenu({
  at,
  items,
  onClose,
  minWidth = 128,
  width,
  ariaLabel,
  itemClassName,
}: PointMenuProps) {
  const [closing, setClosing] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // 打开前的焦点：Esc 关闭时还给它（原生菜单行为）
  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  const requestClose = useCallback(
    (focusReason: 'escape' | 'action' | 'outside') => {
      if (fadeTimerRef.current) return
      setClosing(true)
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = undefined
        const previous = previousFocusRef.current
        const active = document.activeElement
        /**
         * 焦点归还：
         * - Esc：无条件还给打开前的元素；
         * - 选中菜单项：焦点还在菜单里（菜单马上要被卸载）才还 ——
         *   动作自己把焦点挪走了（弹窗打开并聚焦输入框）就别抢回来；
         * - 点外部：用户点的就是别处，不动。
         */
        const focusStillInMenu = active instanceof Element && active.closest('[role="menu"]') !== null
        if (previous?.isConnected && (focusReason === 'escape' || (focusReason === 'action' && focusStillInMenu))) {
          previous.focus()
        }
        onClose()
      }, FADE_MS)
    },
    [onClose],
  )

  // 虚拟锚点：落在点击处、零尺寸 —— Positioner 拿它做 side/align 与贴边翻转
  const anchor = useMemo(
    () => ({ getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) }),
    [at.x, at.y],
  )

  const container =
    typeof document === 'undefined'
      ? undefined
      : document.getElementById('overlay-root') ?? document.body

  return (
    <Menu.Root
      open={!closing}
      modal={false}
      loopFocus
      onOpenChange={(next, details) => {
        if (next) return
        /**
         * `sibling-open` = 「同组另一个菜单打开了」——子菜单展开时也会发到父菜单上。
         * 根菜单是受控的（`open={!closing}`），照它关会把整个菜单一起收掉：
         * 子菜单的开关交给 `Menu.SubmenuRoot` 自己管。
         */
        if (details.reason === 'sibling-open') return
        requestClose(
          details.reason === 'escape-key'
            ? 'escape'
            : details.reason === 'item-press'
              ? 'action'
              : 'outside',
        )
      }}
    >
      <Menu.Portal container={container}>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={0}
          positionMethod="fixed"
          collisionPadding={8}
          className={POSITIONER}
        >
          <Menu.Popup
            aria-label={ariaLabel}
            // 焦点自己管（见 requestClose）：库的默认行为会把焦点还给「触发器」，
            // 虚拟锚点没有触发器，且选中项后可能抢走进弹窗的焦点。
            finalFocus={false}
            onClick={stopMenuClick}
            className={cn(POPUP, 'min-w-32')}
            style={{ minWidth, ...(width ? { width } : {}) }}
          >
            <MenuRows items={items} container={container} itemClassName={itemClassName} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
