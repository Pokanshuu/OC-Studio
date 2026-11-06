'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'
import { useMediaMenu } from '@/lib/use-media-menu'

/** 删除后 state 可能停在旧下标上：显示和翻页都先夹回有效范围 */
function clampSliderIndex(index: number, length: number): number {
  return Math.min(Math.max(0, index), Math.max(0, length - 1))
}

function stepSliderIndex(index: number, length: number, direction: 1 | -1): number {
  const max = Math.max(0, length - 1)
  const current = clampSliderIndex(index, length)
  if (direction === 1) return current < max ? current + 1 : 0
  return current > 0 ? current - 1 : max
}

interface ImageGallerySliderProps {
  images: string[]
  onViewImage: (index: number) => void
  onOpenMenu: (index: number, at: { x: number; y: number }) => void
  uploading: boolean
  onUploadClick: () => void
}

/** slider 模式：左右滑动/鼠标拖拽切换 + 圆点导航 + 全屏查看 */
export function ImageGallerySlider({
  images,
  onViewImage,
  onOpenMenu,
  uploading,
  onUploadClick,
}: ImageGallerySliderProps) {
  const [sliderIndex, setSliderIndex] = useState(0)
  const touchStartRef = useRef<number>(0)
  const touchSwipingRef = useRef(false)
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null)
  const mouseDraggingRef = useRef(false)
  const handlersFor = useMediaMenu<number>((index, at) => {
    if (index !== undefined) onOpenMenu(index, at)
  })

  const currentIndex = clampSliderIndex(sliderIndex, images.length)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX
    touchSwipingRef.current = true
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchSwipingRef.current || images.length < 2) return
      touchSwipingRef.current = false
      const diff = touchStartRef.current - e.changedTouches[0].clientX
      if (Math.abs(diff) > 40) {
        setSliderIndex((i) => stepSliderIndex(i, images.length, diff > 0 ? 1 : -1))
      }
    },
    [images.length],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseStartRef.current = { x: e.clientX, y: e.clientY }
    mouseDraggingRef.current = false
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseStartRef.current || images.length < 2) return
    const dx = Math.abs(e.clientX - mouseStartRef.current.x)
    const dy = Math.abs(e.clientY - mouseStartRef.current.y)
    if (dx > 5 || dy > 5) {
      mouseDraggingRef.current = true
    }
  }, [images.length])

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!mouseStartRef.current || images.length < 2) {
        mouseStartRef.current = null
        return
      }
      const diff = mouseStartRef.current.x - e.clientX
      mouseStartRef.current = null
      if (Math.abs(diff) > 40) {
        setSliderIndex((i) => stepSliderIndex(i, images.length, diff > 0 ? 1 : -1))
      }
    },
    [images.length],
  )

  const handleClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (mouseDraggingRef.current) {
        e.stopPropagation()
        e.preventDefault()
        mouseDraggingRef.current = false
      }
    },
    [],
  )

  const prevImage = useCallback(() => {
    setSliderIndex((i) => stepSliderIndex(i, images.length, -1))
  }, [images.length])

  const nextImage = useCallback(() => {
    setSliderIndex((i) => stepSliderIndex(i, images.length, 1))
  }, [images.length])

  return (
    <div className="relative h-full w-full">
      {images.length > 0 ? (
        <div className="relative flex h-full w-full items-center">
          {images.length > 1 ? (
            <button
              onClick={prevImage}
              className="absolute left-2 z-[5] flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/80 hover:bg-black/40 transition-colors"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          <div
            className="group relative h-full w-full overflow-hidden rounded-item select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { mouseStartRef.current = null }}
            onClickCapture={handleClickCapture}
          >
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {images.map((url, i) => (
                <div key={i} className="h-full w-full shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImageUrl(url)}
                    alt=""
                    className="h-full w-full cursor-zoom-in object-contain"
                    {...handlersFor(i)}
                    onClick={() => onViewImage(i)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/defaults/character-avatar.svg'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          {images.length > 1 ? (
            <button
              onClick={nextImage}
              className="absolute right-2 z-[5] flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/80 hover:bg-black/40 transition-colors"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onUploadClick}
          disabled={uploading}
          className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-item border border-dashed border-line bg-paper-card transition-colors hover:border-line-hover disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={24} strokeWidth={1.5} className="animate-spin text-ink-faint" />
          ) : (
            <ImageIcon size={24} strokeWidth={1.5} className="text-ink-faint" />
          )}
          <span className="text-xs text-ink-faint">点击上传立绘</span>
        </button>
      )}
      {images.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setSliderIndex(i)}
              className={`h-1.5 transition-all ${
                i === currentIndex ? 'w-4 bg-ink-muted' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
