'use client'

/**
 * 列表页外壳：**页头贴在滚动容器内部**（`sticky`），内容从它背后穿过去，
 * 所以上滑时那层 `backdrop-blur` 才有东西可糊（`AGENTS.md` 约束 10：
 * 模糊的 header 必须是滚动容器的子元素，不能是平级兄弟）。
 *
 * 两种形态：
 * - 默认（滚动）：一个滚动容器，页头 `sticky top-0` 在第一行；静止无线无底色，
 *   上滑后才给**整块页头**叠 `TOOLBAR_SHADE`——底色 / 模糊 / 底线由这里统一给，
 *   页头里的每一行（工具栏、文件夹条……）都不许再自己画一层：
 *   多行页头各画一层，第二行就会漏成「没糊、内容直接穿过去」。
 * - `fill`（画廊这种上下分栏）：页头在容器**外**、内容自己管滚动（分栏各自滚）。
 *   这种情况下没有内容会穿到页头背后，所以也不需要模糊
 *
 * 注意：滚动容器上**不要写上下 padding**（padding 不参与滚动，内容到不了页头背后），
 * 需要留白就加在内容里，或用 `bodyClassName` 的左右 padding。
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { TOOLBAR_PLAIN, TOOLBAR_SHADE } from '@/lib/ui-tokens'
import { useScrollShade } from '@/lib/use-scroll-shade'

const HeaderSurfaceContext = createContext(false)

/** 页头里的组件：底色 / 模糊是否已由 `ListShell` 的页头表面负责（是则不要再叠一层） */
export function useInHeaderSurface(): boolean {
  return useContext(HeaderSurfaceContext)
}

interface ListShellProps {
  /** 页头（可多行）。底色 / 模糊 / 底线由外壳统一给，这里只管排内容 */
  header: () => ReactNode
  children: ReactNode
  /** 滚动容器的类名（只放左右内边距；上下留白放内容里） */
  bodyClassName?: string
  /** 内容自己管滚动（上下分栏）：页头移到容器外，外层不再滚 */
  fill?: boolean
  className?: string
}

export function ListShell({ header, children, bodyClassName = '', fill = false, className = '' }: ListShellProps) {
  // 元素进 state（回调 ref）：画廊 / 卡片切换会换掉滚动节点，effect 必须跟着重挂
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const scrolled = useScrollShade(scrollEl)

  if (fill) {
    return (
      <div className={`flex h-full min-h-0 flex-col ${className}`}>
        {header()}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    )
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {/*
        滚动容器是 **flex 列**：页面内容那一层写 `flex-1` 就能撑满可视区 ——
        空态要靠它才能纵向居中。子项一律 `shrink-0`：内容长到溢出时，默认的 `shrink` 会把
        页头 / 移动端 spacer 压扁（它们没有内容兜底，会被压成 0）。
      */}
      <div
        ref={setScrollEl}
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [&>*]:shrink-0 ${bodyClassName}`}
      >
        <div className="sticky top-0 z-20">
          {/*
            页头表面：**整块**页头共用一层底色 + 模糊。做成页头底下的绝对定位层，
            而不是直接给页头容器加 `backdrop-filter` —— 后者会让容器成为
            `position: fixed` 的包含块，把页头里的移动端固定筛选条一起拖进文档流。
          */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 transition-colors ${scrolled ? TOOLBAR_SHADE : TOOLBAR_PLAIN}`}
          />
          <div className="relative">
            <HeaderSurfaceContext.Provider value={true}>{header()}</HeaderSurfaceContext.Provider>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
