'use client'

/**
 * 角色编辑器左栏的「[ListFilter] 筛选」分组菜单（按国家 / 按文件夹）。
 *
 * 只做展示分组的选择：`onChange` 由列表自己落偏好，这里不碰任何实体。
 * 面板走 Base UI Menu（触发器锚定，不用虚拟锚点）：贴边翻转、点外部按下即关、
 * ↑↓ 首尾循环、Enter 选中、Esc 关闭并把焦点还给触发按钮，全部是库的原生行为。
 * 单选语义用 `Menu.RadioGroup` / `Menu.RadioItem`（`role="menuitemradio"` + `aria-checked`），
 * 当前项打勾。标题「分组方式」。
 */
import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Check, ListFilter } from 'lucide-react'
import { MENU, MENU_GROUP_LABEL, MENU_ITEM_BASE, ROUND_CONTROL } from '@/lib/ui-tokens'
import { cn } from '@/lib/utils'

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

  const triggerClass = `touch-feedback flex h-6 items-center gap-1 px-1.5 text-caption text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink max-md:h-8 max-md:text-ui ${ROUND_CONTROL} ${className}`

  const container =
    typeof document === 'undefined'
      ? undefined
      : document.getElementById('overlay-root') ?? document.body

  return (
    <Menu.Root open={open} onOpenChange={setOpen} modal={false} loopFocus>
      <Menu.Trigger aria-label={ariaLabel} className={triggerClass}>
        <ListFilter size={13} strokeWidth={2} className="shrink-0" />
        <span>{label}</span>
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
            aria-label={title}
            className={`${MENU} pointer-events-auto flex flex-col outline-none`}
          >
            {/* 分组标题用普通 div：`Menu.GroupLabel` 必须包在 `Menu.Group` 里，
                而这里只有一个组、不需要 group 语义（下拉菜单那边也是这么做的） */}
            <div className={MENU_GROUP_LABEL} aria-hidden>
              {title}
            </div>
            <Menu.RadioGroup
              value={value}
              onValueChange={(next) => {
                onChange(next as T)
                setOpen(false)
              }}
            >
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  className={cn(
                    MENU_ITEM_BASE,
                    'text-ink-muted data-highlighted:bg-[var(--oc-hover)] data-highlighted:text-ink',
                    'data-checked:bg-[var(--oc-hover)] data-checked:text-ink',
                  )}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  <Menu.RadioItemIndicator className="shrink-0">
                    <Check size={13} strokeWidth={2} />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
