'use client'

/**
 * 选中节点右上角浮出的「打开」圆钮。
 *
 * 为什么要有它：`docs/关系图.md` §10 把单击改成了**选中**、双击才是打开。
 * 双击是隐藏动作，光靠它没人发现得了；这一枚钮是同一动作的可见入口
 * （给不想双击的人）。只在选中时出现，平时不占画面。
 *
 * `nodrag` 是 React Flow 的约定：按下不算拖节点，否则按住钮稍微一动整颗节点就跟走了。
 */
import { ArrowUpRight } from 'lucide-react'

export function NodeOpenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="打开"
      title="打开"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className="nodrag absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-paper text-ink transition-colors hover:border-line-hover"
    >
      <ArrowUpRight size={11} strokeWidth={2} />
    </button>
  )
}
