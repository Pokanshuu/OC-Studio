'use client'

interface ListWidthResizerProps {
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void
  onReset: () => void
}

/** 列表栏右缘 6px 命中区：拖动调宽，双击复位；不画分隔线。 */
export function ListWidthResizer({ onDragStart, onReset }: ListWidthResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整列表宽度"
      title="拖动调整，双击复位"
      onPointerDown={onDragStart}
      onDoubleClick={onReset}
      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-[var(--oc-hover)]"
    />
  )
}
