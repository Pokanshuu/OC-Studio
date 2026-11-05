'use client'

/**
 * 页面页头（S4）：左标题（`PAGE_TITLE`）+ 右侧动作区，48px。
 *
 * **静止时是纸的一部分**：没有分隔线、没有底色；内容向上滚过判定阈值后，
 * 才补 1px 线与 `backdrop-blur`。两种接法，按页面的滚动结构选：
 * - 页头在滚动容器**里面**（内容会从它背后穿过）：用 `ListShell`，底色与模糊由外壳
 *   的页头表面统一给，这里不要再传 `scrolled`；
 * - 页头自己就是粘顶元素（相册右栏这种自定义布局）：页面用 `useScrollShade` 读滚动容器，
 *   把 `scrolled` 传进来。
 *
 * 用法：
 * - 小说书架 / 地图 / 树表 / 相册 —— 不要再各写一遍 48px 页头
 * - 页头内控件一律 `h-8`，图标按钮 `h-6`（`ICON_BTN_MD` 用于返回）
 */
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE, TOOLBAR_PLAIN, TOOLBAR_SHADE } from '@/lib/ui-tokens'
import { useInHeaderSurface } from './ListShell'

interface PageToolbarProps {
  title: string
  /** 标题右侧的附加控件（地图选择 / 相册折叠目录） */
  children?: ReactNode
  /** 右侧动作区 */
  actions?: ReactNode
  /** 可选返回：`ICON_BTN_MD` + `ArrowLeft` + 「返回」 */
  onBack?: () => void
  /** 内容是否已向上滚动（决定线 / 模糊是否出现）；已在 `ListShell` 页头里时忽略 */
  scrolled?: boolean
  /** 桌面端是否粘顶（移动端不粘顶） */
  sticky?: boolean
  /** 移动端隐藏标题：手机顶栏已经显示页面标题时，避免两行同名 */
  hideTitleOnMobile?: boolean
  className?: string
}

export function PageToolbar({
  title,
  children,
  actions,
  onBack,
  scrolled = false,
  sticky = true,
  hideTitleOnMobile = false,
  className = '',
}: PageToolbarProps) {
  const inSurface = useInHeaderSurface()
  const shade = inSurface ? '' : scrolled ? TOOLBAR_SHADE : TOOLBAR_PLAIN

  return (
    <header
      className={`flex h-12 shrink-0 items-center justify-between gap-4 px-4 transition-colors ${
        sticky ? 'md:sticky md:top-0 md:z-10' : ''
      } ${shade} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            data-mobile-back
            className={`${ICON_BTN_MD} w-auto gap-1 px-1.5`}
            aria-label="返回"
            title="返回"
          >
            <ArrowLeft size={16} strokeWidth={2} />
            <span className="text-[13px]">返回</span>
          </button>
        ) : null}
        <h1 className={`shrink-0 ${PAGE_TITLE} ${hideTitleOnMobile ? 'max-md:hidden' : ''}`}>{title}</h1>
        {children ? <div className="flex min-w-0 items-center gap-3">{children}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
