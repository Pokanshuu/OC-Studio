'use client'

import type { ReactElement, ReactNode } from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { TOOLTIP } from '@/lib/ui-tokens'
import { shortcutLabel } from '@/lib/shortcut-label'

/**
 * 悬停提示（Tooltip）—— 桌面应用的那一档，替代原生 `title`。
 *
 * 原生 `title` 是浏览器画的：约 1 秒才出来、字体与底色跟着系统走（暗色主题下
 * 可能是一块浅色框）、位置不能控制、触屏完全不出。每个图标按钮都在靠它说明
 * 自己是什么，也就每个图标按钮都在提醒用户「这是 WebView」。
 *
 * 行为：
 * - 延迟 500ms 出现，**同一组按钮之间移动时立即切换**（Base UI 的 `Provider` 分组延迟）；
 * - 触屏不出现（Base UI 的 tooltip 只认 hover / focus，触摸不触发）；
 * - 淡入 `duration-fast`，**不做缩放**（缩放是手机的手感）；
 * - Portal 到 `#overlay-root`，不会被困在带 `overflow` / `backdrop-blur` 的祖先里。
 *
 * 用法：
 * ```tsx
 * <Tip label="保存" shortcut="Ctrl+S">
 *   <button className={ICON_BTN}><Save size={16} strokeWidth={2} /></button>
 * </Tip>
 * ```
 * `children` 必须是**单个可聚焦元素**（`Trigger` 会把事件直接并到它身上，
 * 不会另套一层 button —— 否则一颗按钮里会有两个嵌套的按钮）。
 */

/** 应用根部包一层：整棵树共用一个延迟，相邻按钮之间即时切换。 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={500} closeDelay={80} timeout={400}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

interface TipProps {
  /** 一句话说明这个按钮是什么（不是它做了什么长句） */
  label: string
  /** 快捷键，写法用项目里的组合串（`Ctrl+Shift+Z`），macOS 上自动显示成 ⌘⇧Z */
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}

export function Tip({ label, shortcut, side = 'bottom', children }: TipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal
        container={typeof document !== 'undefined' ? document.getElementById('overlay-root') : null}
      >
        <TooltipPrimitive.Positioner side={side} sideOffset={6}>
          <TooltipPrimitive.Popup
            data-slot="tooltip"
            className={`${TOOLTIP} data-open:animate-in data-open:fade-in-0 duration-fast`}
          >
            {label}
            {shortcut ? <span className="ml-2 text-ink-faint">{shortcutLabel(shortcut)}</span> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
