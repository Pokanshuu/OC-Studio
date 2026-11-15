'use client'

/**
 * 通用筛选下拉：触发按钮 + Base UI Menu 面板（触发器锚定，不是点击坐标菜单）。
 * 样式由调用点传入（各列表页的触发按钮/面板密度不同），行为只有这一份实现。
 *
 * 换 Base UI 之后拿到的行为：↓ 打开、↑↓ 首尾循环、Enter 选中、Esc 关闭并把焦点还给
 * 触发按钮、贴边翻转、点外部**按下即关**。
 */
import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MENU, MENU_ITEM_BASE } from '@/lib/ui-tokens'

export interface FilterOption<T extends string | number = number | 'all'> {
  value: T
  label: string
}

interface FilterSelectProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: FilterOption<T>[]
  /** 找不到当前项时的兜底文案（通常是「全部 XX」） */
  fallbackLabel: string
  /** 触发按钮类名（各调用点样式不同，从这里传） */
  triggerClassName: string
  /** 面板的补充类名（只写内容相关的：滚动 / 留白；定位归 Positioner） */
  panelClassName?: string
  itemClassName?: string
  /** 当前项的高亮类名 */
  activeItemClassName?: string
  /** 触发按钮里文字那一层的类名（需要截断时传 max-w-* truncate） */
  labelClassName?: string
  chevronSize?: number
  /** 面板最大高度（用于长列表滚动） */
  maxHeightClassName?: string
}

export function FilterSelect<T extends string | number>({
  value,
  onChange,
  options,
  fallbackLabel,
  triggerClassName,
  panelClassName = 'flex flex-col overflow-auto',
  itemClassName = `${MENU_ITEM_BASE} whitespace-nowrap`,
  activeItemClassName = 'bg-[var(--oc-hover)] text-ink',
  labelClassName,
  chevronSize = 14,
  maxHeightClassName = 'max-h-64',
}: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? fallbackLabel

  const container =
    typeof document === 'undefined'
      ? undefined
      : document.getElementById('overlay-root') ?? document.body

  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false} loopFocus>
      <Menu.Trigger className={triggerClassName}>
        <span className={labelClassName}>{selectedLabel}</span>
        <ChevronDown size={chevronSize} strokeWidth={2} />
      </Menu.Trigger>

      <Menu.Portal container={container}>
        <Menu.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          positionMethod="fixed"
          collisionPadding={8}
          className="z-[99999]"
        >
          <Menu.Popup
            className={cn(
              MENU,
              'pointer-events-auto flex flex-col outline-none',
              maxHeightClassName,
              panelClassName,
            )}
          >
            {options.map((option) => (
              <Menu.Item
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  itemClassName,
                  value === option.value
                    ? activeItemClassName
                    : 'text-ink-muted data-highlighted:bg-[var(--oc-hover)] data-highlighted:text-ink',
                )}
              >
                {option.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
