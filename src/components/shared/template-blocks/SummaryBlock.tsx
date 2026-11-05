'use client'

/**
 * 简介组件（`docs/模板.md §6.9`）：多行纯文本，无边框。
 *
 * 三个用途共用这一份：编辑器展示 / 列表卡摘要 / 导出卡副标题。
 * 事件、国家、词条（分类条目）都写自己的那一列，组件不关心列名叫什么。
 */
import { ComponentSection } from '../ComponentSection'

interface SummaryBlockProps {
  value: string
  onChange: (value: string) => void
  showTitle?: boolean
  title?: string
  rows?: number
  placeholder?: string
}

export function SummaryBlock({
  value,
  onChange,
  showTitle = true,
  title = '简介',
  rows = 2,
  placeholder = '一句话概括',
}: SummaryBlockProps) {
  return (
    <ComponentSection title={showTitle ? title : undefined}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={title}
        className="w-full resize-none bg-transparent text-sm leading-6 text-ink placeholder:text-ink-faint focus:outline-none"
      />
    </ComponentSection>
  )
}
