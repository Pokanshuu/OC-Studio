'use client'

/**
 * 小节壳 —— 组件化的第一个抽取物（`docs/模板.md §5`）。
 *
 * 一个区块只有三样东西：**标题行 · 右侧动作 · 内容**。间距由外层给
 * （区块之间 `gap-8`，标题行到内容 12px），壳自己不写 margin —— 否则
 * 十一个组件各带一点距离，一定会漂。
 *
 * 唯一例外是**分隔线到内容**的那 24px：线画在区块顶边，外层 gap 全在线**上方**，
 * 不补这一段线就贴在标题上。所以带 `divider` 的区块自己带 `pt-6`。
 *
 * 三种状态：
 * - 空：只渲染标题行（约 24px），内容不占位
 * - 满：标题行 + 内容
 * - 只读：`action` 不传
 *
 * **写作面上不许出现**：卡片容器、描边、虚线框、悬停才现的 🗑、「还没有内容」这类提示句。
 *
 * 唯一的例外是**悬停才现的 ⚙**（2026-11-08）：它只做一件事 —— 跳到这个组件的设置
 * （基本信息 / 正文的组件库）。危险动作（删除之类）仍然只放在编辑器的动作区，
 * 不许跟着悬停浮出来。
 */
import type { ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { SECTION_TITLE_BARE } from '@/lib/ui-tokens'

interface ComponentSectionProps {
  /** 不传 = 没有标题行（封面 / 正文） */
  title?: string
  /** 标题右侧的「＋ 添加」这类动作 */
  action?: ReactNode
  /** 区块顶部 1px 线（连带 24px 上内边距）；第一个区块传 false */
  divider?: boolean
  children?: ReactNode
  className?: string
  /** 调试 / 端到端测试用：标明这块由哪个模板组件渲染 */
  componentId?: string
  componentLabel?: string
  /** 悬停时在区块右上角浮出的设置键（跳组件设置）。不传 = 没有这个入口 */
  onEdit?: () => void
  editLabel?: string
}

export function ComponentSection({
  title,
  action,
  divider = true,
  children,
  className = '',
  componentId,
  componentLabel,
  onEdit,
  editLabel = '编辑组件',
}: ComponentSectionProps) {
  const hasContent = children !== null && children !== undefined && children !== false
  const editButton = onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      title={editLabel}
      aria-label={editLabel}
      tabIndex={-1}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <SlidersHorizontal size={13} strokeWidth={2} />
    </button>
  ) : null
  return (
    <section
      className={`group relative ${divider ? 'border-t border-line pt-6' : ''} ${className}`}
      data-component-id={componentId}
      data-component-label={componentLabel}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3">
          <h3 className={SECTION_TITLE_BARE}>{title}</h3>
          <span className="flex items-center gap-1">
            {editButton}
            {action}
          </span>
        </div>
      ) : action ? (
        // 没有标题但仍要有动作（画廊关掉标题时的「添加」）：动作靠右，别把入口一起藏掉
        <div className="flex items-center justify-end gap-3">
          {editButton}
          {action}
        </div>
      ) : (
        // 封面 / 正文这种没有标题行的块：设置键浮在右上角（静止不占位）
        editButton !== null && <span className="absolute right-0 top-0">{editButton}</span>
      )}
      {hasContent ? <div className={title || action ? 'mt-3' : ''}>{children}</div> : null}
    </section>
  )
}
