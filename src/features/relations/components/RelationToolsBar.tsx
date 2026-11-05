'use client'

/**
 * 右上：**新建 + 其余动作**（docs/关系图.md §10）。
 *
 * 只有两件：`＋ 新建`（图上的第一动作：造一个节点）和 `⋯`。
 * 「整理 / 刷新 / 导出」都收进 ⋯ —— 其中「整理」一次覆盖全部手摆位置，
 * 放一级栏太容易手滑（撤销提示只有几秒，位置却已经写盘）。
 */
import { MoreHorizontal, Plus } from 'lucide-react'
import { FLOAT_BAR, FLOAT_BAR_ICON, FLOAT_BAR_TEXT } from '@/lib/ui-tokens'

export function RelationToolsBar({
  onCreate,
  onMore,
}: {
  onCreate: () => void
  onMore: (at: { x: number; y: number }) => void
}) {
  return (
    <div className={`pointer-events-auto ${FLOAT_BAR}`}>
      <button type="button" onClick={onCreate} className={FLOAT_BAR_TEXT}>
        <Plus size={13} strokeWidth={2} />
        新建
      </button>
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          onMore({ x: rect.left, y: rect.bottom + 6 })
        }}
        className={FLOAT_BAR_ICON}
        aria-label="更多"
        title="更多"
      >
        <MoreHorizontal size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
