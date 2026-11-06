'use client'

/**
 * 简介组件（`docs/模板.md §6.9`）：多行纯文本，无边框。
 *
 * 三个用途共用这一份：编辑器展示 / 列表卡摘要 / 导出卡副标题。
 * 事件、国家、词条（分类条目）都写自己的那一列，组件不关心列名叫什么。
 */
import { plainTextOf } from '@/lib/export/site/render'
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
  // 老库里「简介」是编辑器直出的 HTML（角色的 `bio`、国家的 `description`），
  // 这一列现在按纯文本用 —— 展示前剥成文本，别把标签当字画出来。
  // 用户不去改它，表单状态仍是原值，保存不会写回（未改动就不写）。
  return (
    <ComponentSection divider={false} title={showTitle ? title : undefined}>
      <textarea
        value={plainTextOf(value)}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={title}
        className="w-full resize-none bg-transparent text-sm leading-6 text-ink placeholder:text-ink-faint focus:outline-none"
      />
    </ComponentSection>
  )
}
