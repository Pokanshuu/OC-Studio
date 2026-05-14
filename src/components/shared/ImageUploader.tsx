'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Trash2 } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { ImageCropper } from './ImageCropper'

export interface ImageUploaderProps {
  value?: string
  onChange: (path: string) => void
  onRemove?: () => void
  aspectRatio?: '1:1' | '3:4' | '4:3' | '3:1'
  placeholderText?: string
  size?: 'sm' | 'md' | 'lg'
  enableCrop?: boolean
  cropAspect?: number
  cropShape?: 'rect' | 'round'
  shape?: 'circle' | 'rect'
}

const ASPECT_CLASS: Record<string, string> = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
  '3:1': 'aspect-[3/1]',
}

const ASPECT_RATIO_MAP: Record<string, number> = {
  '1:1': 1,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '3:1': 3,
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'w-24',
  md: 'w-32',
  lg: 'w-48',
}

export function ImageUploader({
  value,
  onChange,
  onRemove,
  aspectRatio = '1:1',
  placeholderText = '点击上传',
  size = 'md',
  enableCrop = false,
  cropAspect,
  cropShape,
  shape = 'rect',
}: ImageUploaderProps) {
  const [rawFileUrl, setRawFileUrl] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentSrc = value ? resolveImageUrl(value) : undefined
  const effectiveCropAspect = cropAspect ?? ASPECT_RATIO_MAP[aspectRatio] ?? 1
  const effectiveCropShape = cropShape ?? (effectiveCropAspect === 1 ? 'round' : 'rect')

  async function handleClick() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (enableCrop) {
      if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(URL.createObjectURL(file))
      setCropperOpen(true)
    } else {
      // 当前 Q 版头像始终走裁剪分支（enableCrop），此分支作为 fallback 保留
      const url = await saveBlobToDisk(file, 'qavatar')
      onChange(url)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleCropComplete(blob: Blob) {
    const url = await saveBlobToDisk(blob, 'qavatar')
    onChange(url)
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

  return (
    <>
      <div
        className={`group relative ${SIZE_CLASS[size]} ${ASPECT_CLASS[aspectRatio]} ${shape === 'circle' ? 'rounded-full' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {currentSrc ? (
          <div className={`group/image relative h-full w-full overflow-hidden ${shape === 'circle' ? 'rounded-full' : 'rounded-md'}`}>
            <button
              type="button"
              onClick={handleClick}
              className="absolute inset-0 h-full w-full bg-transparent hover:bg-transparent"
              aria-label="更换图片"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentSrc} alt="" className="h-full w-full object-cover pointer-events-none" />
            <div className={`absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/image:opacity-100 pointer-events-none ${shape === 'circle' ? 'rounded-full' : 'rounded'}`}>
              <span className="rounded px-2 py-1 text-xs text-white">更换</span>
            </div>
            {onRemove ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 transition-opacity group-hover/image:opacity-100 hover:bg-black/60"
                title="删除"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-line bg-paper-card transition-colors hover:border-line-hover ${shape === 'circle' ? 'rounded-full' : 'rounded-md'}`}
          >
            <ImageIcon size={16} strokeWidth={2} className="text-ink-faint" />
            <span className="text-xs text-ink-faint">{placeholderText}</span>
          </button>
        )}
      </div>

      {rawFileUrl ? (
        <ImageCropper
          open={cropperOpen}
          src={rawFileUrl}
          aspect={effectiveCropAspect}
          shape={effectiveCropShape}
          onComplete={handleCropComplete}
          onClose={handleCropperClose}
        />
      ) : null}
    </>
  )
}
