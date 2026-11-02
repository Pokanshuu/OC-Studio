'use client'

import { useState, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { RotateCcw, RotateCw, Check, X, ZoomOut, ZoomIn, Loader2 } from 'lucide-react'
import { getCroppedBlob } from '@/lib/image-crop'
import 'react-easy-crop/react-easy-crop.css'

interface ImageCropperProps {
  open: boolean
  src: string
  aspect: number
  shape?: 'rect' | 'round'
  loading?: boolean
  onComplete: (blob: Blob) => void
  onClose: () => void
}

export function ImageCropper({
  open,
  src,
  aspect,
  shape = 'rect',
  loading = false,
  onComplete,
  onClose,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setRotation(0)
      setCroppedAreaPixels(null)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    try {
      const blob = await getCroppedBlob(src, croppedAreaPixels, rotation)
      onComplete(blob)
    } catch {
      onClose()
    }
  }

  const handleReset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-paper pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-medium text-ink">裁剪图片</h2>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Cropper area */}
      <div className="relative flex-1 bg-black/80">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          cropShape={shape}
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={(_, areaPixels) => {
            setCroppedAreaPixels(areaPixels)
          }}
        />
        {/* HEIF 转换中覆盖层 */}
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 size={28} strokeWidth={2} className="animate-spin text-white/80 mb-2" />
            <span className="text-sm text-white/70">图片转换中…</span>
          </div>
        ) : null}
      </div>

      {/* Bottom toolbar — desktop */}
      <div className="hidden shrink-0 items-center border-t border-line px-4 py-3 md:flex">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation((r) => r - 90)}
            className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            <RotateCcw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => r + 90)}
            className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            <RotateCw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            重置
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          <ZoomOut size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-8 w-32 cursor-pointer appearance-none bg-transparent
              [&::-webkit-slider-runnable-track]:h-1
              [&::-webkit-slider-runnable-track]:rounded
              [&::-webkit-slider-runnable-track]:bg-line-hover
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:-mt-1
              [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-ink
              [&::-webkit-slider-thumb]:border
              [&::-webkit-slider-thumb]:border-line
              [&::-moz-range-track]:h-1
              [&::-moz-range-track]:rounded
              [&::-moz-range-track]:bg-line-hover
              [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:w-3.5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-ink
              [&::-moz-range-thumb]:border-line"
          />
          <ZoomIn size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="touch-feedback flex h-9 items-center gap-1.5 rounded bg-ink px-4 text-sm text-paper transition-colors hover:bg-ink/90"
          >
            <Check size={16} strokeWidth={2} />
            <span>确认</span>
          </button>
        </div>
      </div>

      {/* Bottom toolbar — mobile */}
      <div className="flex shrink-0 flex-col gap-3 border-t border-line px-4 py-3 md:hidden">
        <div className="flex items-center gap-1.5">
          <ZoomOut size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-8 w-full cursor-pointer appearance-none bg-transparent
              [&::-webkit-slider-runnable-track]:h-1
              [&::-webkit-slider-runnable-track]:rounded
              [&::-webkit-slider-runnable-track]:bg-line-hover
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:-mt-1
              [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-ink
              [&::-webkit-slider-thumb]:border
              [&::-webkit-slider-thumb]:border-line
              [&::-moz-range-track]:h-1
              [&::-moz-range-track]:rounded
              [&::-moz-range-track]:bg-line-hover
              [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:w-3.5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-ink
              [&::-moz-range-thumb]:border-line"
          />
          <ZoomIn size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRotation((r) => r - 90)}
              className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
            >
              <RotateCcw size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => r + 90)}
              className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
            >
              <RotateCw size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
            >
              重置
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="touch-feedback flex h-9 items-center gap-1.5 rounded bg-ink px-4 text-sm text-paper transition-colors hover:bg-ink/90"
            >
              <Check size={16} strokeWidth={2} />
              <span>确认</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
