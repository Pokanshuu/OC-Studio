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
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="h-12 shrink-0" aria-hidden />
        {children}
      </div>
    </div>
  )
}
