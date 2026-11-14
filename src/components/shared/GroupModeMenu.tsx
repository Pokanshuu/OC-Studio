'use client'

/**
 * 角色编辑器左栏的「[ListFilter] 筛选」分组菜单（按国家 / 按文件夹）。
 *
 * 只做展示分组的选择：`onChange` 由列表自己落偏好，这里不碰任何实体。
 * 面板 Portal 到 `#overlay-root`、坐标在打开前量好、点外部关闭。
 * 键盘：Enter / Space / ↓ 打开，↑↓ / Home / End 移动，Enter 选中，Esc / Tab 关闭并把焦点还给触发按钮。
 * 单选并明确显示当前项（高亮 + 勾）；标题「分组方式」。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ListFilter } from 'lucide-react'
import { MENU, MENU_GROUP_LABEL, MENU_ITEM_BASE, ROUND_CONTROL } from '@/lib/ui-tokens'

export interface GroupModeOption<T extends string> {
  value: T
  label: string
}

interface GroupModeMenuProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: readonly GroupModeOption<T>[]
  /** 菜单标题（默认「分组方式」） */
  title?: string
  /** 触发按钮上的文字（默认「筛选」） */
  label?: string
  /** 触发按钮的无障碍名称（默认「筛选与分组」） */
  ariaLabel?: string
  /** 触发按钮的补充类名（各列表的留白不同） */
  className?: string
}

const MENU_WIDTH = 176
const MENU_EDGE_GAP = 8
const MENU_ITEM_HEIGHT = 27
const MENU_HEADER_HEIGHT = 24
const MENU_PADDING = 8

export interface GroupMenuPlacement {
  left: number
  top: number
  width: number
}

/**
 * 面板落点（纯函数，可测）：默认落在触发按钮下方，下方放不下就翻到上方；
 * 左右夹在视口内，窄栏里也不会被切掉。
 */
export function placeGroupMenu(
  anchor: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  optionCount: number,
): GroupMenuPlacement {
  const height = MENU_PADDING + MENU_HEADER_HEIGHT + optionCount * MENU_ITEM_HEIGHT
  const width = Math.max(0, Math.min(MENU_WIDTH, viewport.width - MENU_EDGE_GAP * 2))
  const left = Math.max(
    MENU_EDGE_GAP,
    Math.min(anchor.left, viewport.width - width - MENU_EDGE_GAP),
  )
  const below = anchor.bottom + 4
  const top =
    below + height <= viewport.height - MENU_EDGE_GAP
      ? below
      : Math.max(MENU_EDGE_GAP, anchor.top - height - 4)
  return { left, top, width }
}

export function GroupModeMenu<T extends string>({
  value,
  onChange,
  options,
  title = '分组方式',
  label = '筛选',
  ariaLabel = '筛选与分组',
  className = '',
}: GroupModeMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<GroupMenuPlacement | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  /** 坐标必须和「打开」在同一次更新里算好，否则面板会先在 (0,0) 画一帧 */
  const openMenu = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const index = options.findIndex((option) => option.value === value)
    setPlacement(
      placeGroupMenu(
        { left: rect.left, top: rect.top, bottom: rect.bottom },
        { width: window.innerWidth, height: window.innerHeight },
        options.length,
      ),
    )
    setFocusIndex(index < 0 ? 0 : index)
    setOpen(true)
  }, [options, value])

  const close = useCallback((refocusTrigger: boolean) => {
    setOpen(false)
    if (refocusTrigger) triggerRef.current?.focus()
  }, [])

  const toggle = useCallback(() => {
    if (open) close(false)
    else openMenu()
  }, [close, open, openMenu])

  // 打开后把焦点放进菜单：键盘用户按 ↓ 打开时能直接上下选
  useEffect(() => {
    if (!open) return
    const item = itemRefs.current[focusIndex]
    item?.focus()
  }, [open, focusIndex])

  // 点外部关闭（不移回焦点：用户点的是别处）
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    // Tab 关闭面板并先把焦点还给触发按钮，浏览器的默认 Tab 再从这里往前后走
    if (event.key === 'Tab') {
      close(true)
      return
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const count = options.length
    if (count === 0) return
    const current = itemRefs.current.findIndex((item) => item === document.activeElement)
    let next = current < 0 ? 0 : current
    if (event.key === 'ArrowDown') next = (next + 1) % count
    else if (event.key === 'ArrowUp') next = (next - 1 + count) % count
    else if (event.key === 'End') next = count - 1
    else next = 0
    itemRefs.current[next]?.focus()
  }

  const triggerClass = `touch-feedback flex h-6 items-center gap-1 px-1.5 text-[12px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink max-md:h-8 max-md:text-[13px] ${ROUND_CONTROL} ${className}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            close(true)
            return
          }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openMenu()
        }}
        className={triggerClass}
      >
        <ListFilter size={13} strokeWidth={2} className="shrink-0" />
        <span>{label}</span>
      </button>

      {open && placement !== null
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={title}
              className={`fixed z-30 flex flex-col ${MENU} pointer-events-auto`}
              style={{ left: placement.left, top: placement.top, width: placement.width }}
              onKeyDown={handlePanelKeyDown}
            >
              <div className={MENU_GROUP_LABEL} aria-hidden>
                {title}
              </div>
              {options.map((option, index) => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      itemRefs.current[index] = element
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option.value)
                      close(true)
                    }}
                    className={`${MENU_ITEM_BASE} ${
                      selected
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {selected ? <Check size={13} strokeWidth={2} className="shrink-0 text-ink" /> : null}
                  </button>
                )
              })}
            </div>,
            document.getElementById('overlay-root')!,
          )
        : null}
    </>
  )
}
