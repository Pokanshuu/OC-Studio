'use client'

import { useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, Trash2, ImageIcon } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { FullscreenViewer } from './FullscreenViewer'
import { ImageCropper } from './ImageCropper'

interface ImageGalleryProps {
  images: string[]
  mode: 'slider' | 'grid'
  onAdd?: (path: string) => void
  onRemove?: (index: number) => void
  columns?: number
  enableCrop?: boolean
  cropAspect?: number
}

export function ImageGallery({
  images,
  mode,
  onAdd,
  onRemove,
  enableCrop = false,
  cropAspect,
}: ImageGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [sliderIndex, setSliderIndex] = useState(0)
  const [rawFileUrl, setRawFileUrl] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)

  function triggerFileUpload() {
    if (!onAdd) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return

      if (enableCrop) {
        if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
        setRawFileUrl(URL.createObjectURL(file))
        setCropperOpen(true)
      } else {
        const url = URL.createObjectURL(file)
        onAdd(url)
      }
    }
    input.click()
  }

  async function handleCropComplete(blob: Blob) {
    const url = await saveBlobToDisk(blob, 'portrait')
    onAdd?.(url)
    setCropperOpen(false)
    if (rawFileUrl) {
      URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(null)
    }
  }

  function handleCropperClose() {
    setCropperOpen(false)
    if (rawFileUrl) {
      URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(null)
    }
  }

  if (mode === 'slider') {
    return (
      <div className="relative h-full w-full">
        {images.length > 0 ? (
          <div className="relative flex h-full w-full items-center">
            {images.length > 1 ? (
              <button
                onClick={() => setSliderIndex((i) => (i > 0 ? i - 1 : images.length - 1))}
                className="absolute left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/80 hover:bg-black/40"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            ) : null}
            <div className="group relative h-full w-full overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(images[sliderIndex])}
                alt=""
                className="h-full w-full cursor-pointer object-contain"
                onClick={() => setViewerIndex(sliderIndex)}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/defaults/character-avatar.svg'
                }}
              />
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onRemove ? (
                  <button
                    onClick={() => onRemove(sliderIndex)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
                    title="删除"
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                ) : null}
                {onAdd ? (
                  <button
                    onClick={triggerFileUpload}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60"
                    title="添加"
                  >
                    <Plus size={16} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            </div>
            {images.length > 1 ? (
              <button
                onClick={() => setSliderIndex((i) => (i < images.length - 1 ? i + 1 : 0))}
                className="absolute right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/80 hover:bg-black/40"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={triggerFileUpload}
            className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper-card transition-colors hover:border-line-hover"
          >
            <ImageIcon size={24} strokeWidth={1.5} className="text-ink-faint" />
            <span className="text-xs text-ink-faint">点击上传立绘</span>
          </button>
        )}
        {images.length > 1 ? (
          <div className="mt-2 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setSliderIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === sliderIndex ? 'w-4 bg-ink-muted' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>
        ) : null}

        {viewerIndex !== null ? (
          <FullscreenViewer
            images={images}
            initialIndex={viewerIndex}
            onClose={() => setViewerIndex(null)}
          />
        ) : null}

        {enableCrop && rawFileUrl ? (
          <ImageCropper
            open={cropperOpen}
            src={rawFileUrl}
            aspect={cropAspect ?? 9 / 16}
            shape="rect"
            onComplete={handleCropComplete}
            onClose={handleCropperClose}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative">
      {images.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper-card">
          <ImageIcon size={20} strokeWidth={2} className="text-ink-faint" />
          <span className="text-xs text-ink-faint">暂无图片</span>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {images.map((url, idx) => (
            <div key={idx} className="group relative aspect-square overflow-hidden rounded-md bg-paper-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(url)}
                alt=""
                className="h-full w-full cursor-pointer object-cover"
                onClick={() => setViewerIndex(idx)}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/defaults/character-avatar.svg'
                }}
              />
              {onRemove ? (
                <button
                  onClick={() => onRemove(idx)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {onAdd ? (
        <button
          onClick={triggerFileUpload}
          className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line bg-paper-card text-sm text-ink-faint transition-colors hover:border-line-hover"
        >
          <Plus size={16} strokeWidth={2} />
          <span>添加图片</span>
        </button>
      ) : null}

      {viewerIndex !== null ? (
        <FullscreenViewer
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  )
}
