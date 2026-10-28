'use client'

import { useRef, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, Menu } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'
import { MiddlePaneResizer } from '@/components/editor/MiddlePaneResizer'
import { useMiddlePaneWidth } from '@/components/editor/useMiddlePaneWidth'

const RAIL_WIDTH = 220

interface MultiColumnEditorProps {
  title: string
  onBack: () => void
  railOpen: boolean
  onToggleRail: () => void
  headerRight: ReactNode
  rail: ReactNode
  meta: ReactNode
  children: ReactNode
}

/**
 * 三栏编辑器公共壳。
 *
 * 顶栏按设计稿分段：左段宽 = 左栏 + 中栏（返回/标题/收起按钮在段尾），右段覆盖正文
 * 并放历史/保存；中栏可拖拽，最大与正文 1:1，宽度跨编辑器记忆。
 */
export function MultiColumnEditor({
  title,
  onBack,
  railOpen,
  onToggleRail,
  headerRight,
  rail,
  meta,
  children,
}: MultiColumnEditorProps) {
  const splitRef = useRef<HTMLDivElement>(null)
  const { width: middleWidth, startDrag, reset } = useMiddlePaneWidth(splitRef)
  const leftWidth = (railOpen ? RAIL_WIDTH : 0) + middleWidth

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-stretch border-b border-line bg-paper/85 backdrop-blur-lg">
        <div
          className="flex min-w-0 items-center gap-3 border-r border-line px-4"
          style={{ width: leftWidth }}
        >
          <button type="button" onClick={onBack} className={ICON_BTN_MD} aria-label="返回">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={`${PAGE_TITLE} truncate`}>{title}</h2>
          <button
            type="button"
            onClick={onToggleRail}
            className={`${ICON_BTN_MD} ml-auto`}
            title={railOpen ? '收起列表' : '展开列表'}
            aria-label={railOpen ? '收起列表' : '展开列表'}
          >
            {railOpen ? <ChevronLeft size={16} strokeWidth={2} /> : <Menu size={16} strokeWidth={2} />}
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 px-4">{headerRight}</div>
      </div>

      <div className="flex min-h-0 flex-1">
        {railOpen ? (
          <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line">{rail}</aside>
        ) : null}

        <div ref={splitRef} className="flex min-h-0 flex-1">
          <section
            className="shrink-0 overflow-y-auto border-r border-line"
            style={{ width: middleWidth }}
          >
            {meta}
          </section>
          <MiddlePaneResizer onDragStart={startDrag} onReset={reset} />
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}
