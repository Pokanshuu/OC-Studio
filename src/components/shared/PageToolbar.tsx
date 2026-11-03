'use client'

/**
 * 页面页头（S4）：左标题（`PAGE_TITLE`）+ 右侧动作区，48px。
 *
 * 桌面粘顶、移动端不粘顶；横向内边距默认 `px-4`（编辑器 / 相册 / 世界观），
 * 列表页传 `className="md:px-6"` 与各自内容列对齐。
 *
 * 用法：
 * - 小说书架 / 地图 / 树表 / 相册 —— 不要再各写一遍 48px 页头
 * - 页头内控件一律 `h-8`，图标按钮 `h-6`（`ICON_BTN_MD` 用于返回）
 */
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'

interface PageToolbarProps {
  title: string
  /** 标题右侧的附加控件（地图选择 / 相册折叠目录） */
  children?: ReactNode
  /** 右侧动作区 */
  actions?: ReactNode
  /** 可选返回：`ICON_BTN_MD` + `ArrowLeft` */
  onBack?: () => void
  className?: string
}

export function PageToolbar({ title, children, actions, onBack, className = '' }: PageToolbarProps) {
  return (
    <header
      className={`flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-paper/85 px-4 backdrop-blur-lg md:sticky md:top-0 md:z-10 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={ICON_BTN_MD}
            aria-label="返回"
            title="返回"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
        ) : null}
        <h1 className={`shrink-0 ${PAGE_TITLE}`}>{title}</h1>
        {children ? <div className="flex min-w-0 items-center gap-3">{children}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
