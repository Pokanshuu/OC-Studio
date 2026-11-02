'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'

export function CustomSectionDragHandle({
  sectionId,
  label,
  onMove,
}: {
  sectionId: string
  label: string
  onMove: (sourceId: string, targetId: string) => void
}) {
  const [active, setActive] = useState(false)
  const [ghost, setGhost] = useState({ x: 0, y: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })

  const stop = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    activeRef.current = false
    setActive(false)
  }

  const start = (event: React.PointerEvent<HTMLSpanElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    startRef.current = { x: event.clientX, y: event.clientY }
    setGhost({ x: event.clientX, y: event.clientY })
    timerRef.current = setTimeout(() => {
      activeRef.current = true
      setActive(true)
    }, 260)

    const move = (moveEvent: PointerEvent): void => {
      const moved = Math.hypot(
        moveEvent.clientX - startRef.current.x,
        moveEvent.clientY - startRef.current.y,
      )
      if (!activeRef.current && moved > 8) {
        stop()
        return
      }
      setGhost({ x: moveEvent.clientX, y: moveEvent.clientY })
    }
    const up = (upEvent: PointerEvent): void => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      const row = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>('[data-custom-section-id]')
      const targetId = row?.dataset.customSectionId
      if (activeRef.current && targetId) onMove(sectionId, targetId)
      activeRef.current = false
      setActive(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      <span
        onPointerDown={start}
        onClick={(event) => event.stopPropagation()}
        style={{ touchAction: 'none' }}
        title="长按后拖动排序"
        className={`flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-ink-faint transition-all hover:scale-125 hover:text-ink-muted active:scale-95 ${
          active ? 'scale-90 opacity-40' : ''
        }`}
      >
        <GripVertical size={13} strokeWidth={2} />
      </span>
      {active
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] rounded-md border border-line-hover bg-paper px-3 py-1.5 text-xs text-ink shadow-lg"
              style={{ left: ghost.x + 12, top: ghost.y - 12 }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}


