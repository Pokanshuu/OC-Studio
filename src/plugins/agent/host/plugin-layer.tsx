'use client'

/**
 * 插件浮层的宿主化外壳。
 *
 * 插件原来把弹窗 / 菜单 / toast 直接 portal 到 `document.body`，而它的样式表
 * 在生成时已经被收进 `.oc-agent-root` —— 于是浮层落在作用域外，**一条规则都
 * 匹配不到**（弹窗是裸 DOM）。这里给出宿主认可的两个东西：
 *
 * 1. 浮层容器：宿主约定所有浮层进 `#overlay-root`（z-index 与层级统一）；
 * 2. 作用域环：浮层内容包一层 `.oc-agent-root`，插件样式与令牌照常生效。
 *
 * `data-theme` 跟着宿主 `<html class="dark">` 走，插件的暗色细则（字号降档、
 * 分段控件底色）才和面板里一致。颜色本身不在这里定义 —— `base.css` 已不再
 * 自带调色板，全部继承宿主 `--oc-*`（主题预设 / 背景图 / 亮暗同一份来源）。
 */

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 宿主浮层容器；渲染期在客户端调用，SSR 阶段返回 null 由调用方退化 */
export function agentOverlayContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById('overlay-root') ?? document.body
}

function useHostDark(): boolean {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains('dark'))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return dark
}

/**
 * 浮层内容的作用域环。**不占尺寸**：子元素都是 `position: fixed`，
 * 这里只负责把 `.oc-agent-root` 与 `data-theme` 带到 `#overlay-root` 里。
 */
export function AgentLayer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const dark = useHostDark()

  return (
    <div className={cn('oc-agent-root', className)} data-theme={dark ? 'dark' : 'light'}>
      {children}
    </div>
  )
}
