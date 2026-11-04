'use client'

/**
 * 列表 / 书架 / 相册的空态（S5）：一句话 + 可选动作。
 *
 * - 有动作时动作是 `EMPTY_HINT`（可点的衬线小字），文案是 `text-sm text-ink-muted`
 * - 纯文本态只用一句话（design skill §9：空态允许一句话，解释交给布局）
 * - 居中、`flex-1`：父级是 `flex flex-col` 时自动撑满
 */
import { EMPTY_HINT } from '@/lib/ui-tokens'

interface ListEmptyStateProps {
  /** 一句事实（「还没有角色」「没有匹配的事件」） */
  message: string
  /** 可选动作（创建 / 清除筛选） */
  action?: { label: string; onClick: () => void }
  className?: string
}

export function ListEmptyState({ message, action, className = '' }: ListEmptyStateProps) {
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-2 ${className}`}>
      <p className="text-sm text-ink-muted">{message}</p>
      {action ? (
        <button type="button" onClick={action.onClick} className={EMPTY_HINT}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
