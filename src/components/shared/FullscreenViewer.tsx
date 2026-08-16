'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'

interface FullscreenViewerProps {
  images: string[]
  initialIndex: number
  onClose: () => void
}

export function FullscreenViewer({ images, initialIndex, onClose }: FullscreenViewerProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [visible, setVisible] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const currentSrc = images[index] ? resolveImageUrl(images[index]) : ''

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1))
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [images.length])

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0))
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [images.length])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => onClose(), 150)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleClose, goPrev, goNext])

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setScale((s) => Math.max(0.25, Math.min(4, s - e.deltaY * 0.002)))
    }
    const el = imgRef.current
    if (el) {
      el.addEventListener('wheel', handler, { passive: false })
    }
    return () => el?.removeEventListener('wheel', handler)
  }, [currentSrc])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { x: pan.x, y: pan.y }
  }, [scale, pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (images.length === 0) return null

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 overflow-hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)] transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <button
        data-fullscreen-close
        onClick={handleClose}
        className="absolute right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 transition-colors hover:bg-white/30"
        style={{ top: `calc(1rem + var(--safe-top, 0px))` }}
      >
        <X size={20} strokeWidth={2} />
      </button>

      {images.length > 1 ? (
        <>
          <button
            onClick={goPrev}
            className="absolute left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 transition-colors hover:bg-white/30"
            style={{ top: `calc(50% + var(--safe-top, 0px) / 2)` }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <button
            onClick={goNext}
            className="absolute right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 transition-colors hover:bg-white/30"
            style={{ top: `calc(50% + var(--safe-top, 0px) / 2)` }}
          >
            <ChevronRight size={20} strokeWidth={2} />
          </button>
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-sm text-white"
            style={{ bottom: `calc(1rem + var(--safe-bottom, 0px))` }}
          >
            {index + 1} / {images.length}
          </div>
        </>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt=""
        className="max-h-[90vh] max-w-[90vw] cursor-grab object-contain transition-transform duration-100"
        style={{
          transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
          cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        draggable={false}
      />
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
