'use client'

/**
 * 设置里的二级页外壳：返回箭头 + 标题，下面接具体内容。
 *
 * 原来「世界」页把这段壳抄了五遍（模板 / 分类 / 组件 / 标签 / …），行高一漂
 * 每个二级页的标题基线都不一样；这里收成一份，两级共用一个入口样式。
 */
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ICON_BTN } from '@/lib/ui-tokens'

export function SettingsSubPage({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-sm text-ink">{title}</span>
      </div>
      {children}
    </div>
  )
}
