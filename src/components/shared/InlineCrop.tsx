'use client'

import { useState, useRef } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import { Check, X } from 'lucide-react'
import { getCroppedDataUrl } from '@/lib/image-crop'
import 'react-image-crop/dist/ReactCrop.css'

interface InlineCropProps {
  src: string
  aspect?: number
  onComplete: (dataUrl: string) => void
  onCancel: () => void
}

export function InlineCrop({
  src,
  aspect,
  onComplete,
  onCancel,
}: InlineCropProps) {
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  function handleConfirm() {
    if (!completedCrop || !imgRef.current) {
      onCancel()
      return
    }
    const dataUrl = getCroppedDataUrl(imgRef.current, {
      x: completedCrop.x,
      y: completedCrop.y,
      width: completedCrop.width,
      height: completedCrop.height,
    })
    if (dataUrl) {
      onComplete(dataUrl)
    } else {
      onCancel()
    }
  }

  return (
    <div className="overflow-hidden rounded-md bg-paper-card">
      <ReactCrop
        crop={crop}
        onChange={(_, percentCrop) => setCrop(percentCrop)}
        onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
        aspect={aspect}
        ruleOfThirds
        minWidth={20}
        minHeight={20}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="" className="max-w-full" draggable={false} />
      </ReactCrop>

      <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          <X size={16} strokeWidth={2} />
          <span>取消</span>
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
  )
}
