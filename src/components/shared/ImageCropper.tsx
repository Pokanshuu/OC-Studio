'use client'

import { useState, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { RotateCcw, RotateCw, Check, X } from 'lucide-react'
import { getCroppedBlob } from '@/lib/image-crop'
import 'react-easy-crop/react-easy-crop.css'

interface ImageCropperProps {
  open: boolean
  src: string
  aspect: number
  shape?: 'rect' | 'round'
  onComplete: (blob: Blob) => void
  onClose: () => void
}

export function ImageCropper({
  open,
  src,
  aspect,
  shape = 'rect',
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
    <div className="fixed inset-0 z-[99999] flex flex-col bg-paper">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-medium text-ink">裁剪图片</h2>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5"
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
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation((r) => r - 90)}
            className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            <RotateCcw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => r + 90)}
            className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            <RotateCw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            重置
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-9 items-center gap-1.5 rounded bg-ink px-4 text-sm text-paper transition-colors hover:bg-ink/90"
          >
            <Check size={16} strokeWidth={2} />
            <span>确认</span>
          </button>
        </div>
      </div>
    </div>
  )
}
