'use client'

/**
 * 设置里「一级入口行」的唯一实现：图标 + 名称 +（元信息）+ 箭头。
 *
 * 两处本来各写了一遍 —— 「世界」页的二级入口（`WorldTab` 的 ENTRY_ITEMS）和
 * 基本信息列表（`BasicInfoPanel`）。同一个语法写两遍，行高、图标尺寸、hover
 * 行为会各自漂；这里收成一份。
 *
 * 分隔线挂在**外层**、不带圆角的容器上（`border-b` + `last:border-b-0`），
 * 行本身只负责 hover 底色 —— 线画在带圆角的元素上会跟着圆角拐弯。
 */
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

export function SettingsEntryRow({
  icon: Icon,
  label,
  meta,
  disabled = false,
  onClick,
}: {
  icon?: LucideIcon
  label: string
  /** 右侧元信息（「15 个字段 · 2 个模板」这类），没有就不传 */
  meta?: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex h-11 w-full items-center gap-2.5 rounded-item px-2 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
      >
        {Icon !== undefined ? <Icon size={15} strokeWidth={2} className="shrink-0 text-ink-muted" /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta !== undefined ? <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{meta}</span> : null}
        {disabled ? null : <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-ink-faint" />}
      </button>
    </div>
  )
}
