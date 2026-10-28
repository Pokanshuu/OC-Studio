'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'

interface MiddlePaneResizerProps {
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void
  onReset: () => void
}

/** 中栏/正文分界线上的 8px 拖拽热区；不额外画线，悬停才显底色。 */
export function MiddlePaneResizer({ onDragStart, onReset }: MiddlePaneResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整中栏宽度"
      title="拖动调整中栏宽度，双击复位"
      onPointerDown={onDragStart}
      onDoubleClick={onReset}
      className="h-full w-2 shrink-0 cursor-col-resize touch-none hover:bg-[var(--oc-hover)]"
    />
  )
}
