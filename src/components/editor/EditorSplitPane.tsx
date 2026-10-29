'use client'

import { useRef, type ReactNode } from 'react'
import { MiddlePaneResizer } from '@/components/editor/MiddlePaneResizer'
import { useMiddlePaneWidth } from '@/components/editor/useMiddlePaneWidth'

interface EditorSplitPaneProps {
  meta: ReactNode
  children: ReactNode
}

/** 多栏编辑器的中栏/正文分栏：中栏可拖拽，最大与正文 1:1。 */
export function EditorSplitPane({ meta, children }: EditorSplitPaneProps) {
  const splitRef = useRef<HTMLDivElement>(null)
  const { width: middleWidth, startDrag, reset } = useMiddlePaneWidth(splitRef)

  return (
    <div ref={splitRef} className="flex min-h-0 flex-1">
      <section
        className="shrink-0 overflow-y-auto border-r border-line"
        style={{ width: middleWidth }}
      >
        <div className="h-12 shrink-0" aria-hidden />
        {meta}
      </section>
      <MiddlePaneResizer onDragStart={startDrag} onReset={reset} />
      {/* 右栏不自己滚动、也不放 48px 占位：正文由 EditorBodyPane 自己持有滚动容器和顶栏占位，
          两处都加会让顶栏下方多空出一整条 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
