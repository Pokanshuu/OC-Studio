'use client'

import { useRef, useState } from 'react'
import { ImageIcon, MoreHorizontal, Loader2 } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'
import { ImageCropper } from './ImageCropper'
import { FullscreenViewer } from './FullscreenViewer'
import { toast } from 'sonner'
import { MENU, MENU_ITEM } from '@/lib/ui-tokens'
import { downloadMediaFile } from '@/lib/media-download'

export interface ImageUploaderProps {
  value?: string
  onChange: (path: string) => void
  onRemove?: () => void
  aspectRatio?: '1:1' | '3:4' | '4:3' | '3:2' | '2:3' | '16:9'
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
  '3:2': 'aspect-[3/2]',
  '2:3': 'aspect-[2/3]',
  '16:9': 'aspect-video',
}

const ASPECT_RATIO_MAP: Record<string, number> = {
  '1:1': 1,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
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
  const [uploading, setUploading] = useState(false)
  const [converting, setConverting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [viewing, setViewing] = useState(false)

  const currentSrc = value ? resolveImageUrl(value) : undefined
  const effectiveCropAspect = cropAspect ?? ASPECT_RATIO_MAP[aspectRatio] ?? 1
  const effectiveCropShape = cropShape ?? (effectiveCropAspect === 1 ? 'round' : 'rect')

  async function handleClick() {
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click() }
  }

  /** 右键菜单的「编辑」：把已有图取回来丢进裁剪器（只有开了裁剪的槽位才有） */
  async function handleEditExisting() {
    if (!currentSrc) return
    try {
      const response = await fetch(currentSrc)
      const blob = await response.blob()
      if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(URL.createObjectURL(blob))
      setCropperOpen(true)
    } catch (err) {
      toast.error('取不到原图', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (enableCrop) {
      if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
      // 立即打开裁剪器，不等待 HEIF 转换（避免大图等待 10 秒+黑屏）
      const initialUrl = URL.createObjectURL(file)
      setRawFileUrl(initialUrl)
      setCropperOpen(true)
      // 后台异步转换 HEIF → JPEG，完成后更新裁剪器画面
      setConverting(true)
      convertHeifToJpeg(file).then((converted) => {
        URL.revokeObjectURL(initialUrl)
        setRawFileUrl(URL.createObjectURL(converted))
        setConverting(false)
      }).catch((err) => {
        console.warn('[ImageUploader] HEIF conversion failed:', err)
        setConverting(false)
      })
    } else {
      setUploading(true)
      try {
        const url = await saveBlobToDisk(file, 'qavatar')
        onChange(url)
      } finally {
        setUploading(false)
      }
    }
  }

  async function handleCropComplete(blob: Blob) {
    setUploading(true)
    try {
      const url = await saveBlobToDisk(blob, 'qavatar')
      onChange(url)
      setCropperOpen(false)
      if (rawFileUrl) {
        URL.revokeObjectURL(rawFileUrl)
        setRawFileUrl(null)
      }
    } finally {
      setUploading(false)
    }
  }

  function handleCropperClose() {
    setCropperOpen(false)
    setConverting(false)
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

        {uploading ? (
          <div className={`flex h-full w-full items-center justify-center border border-dashed border-line bg-paper-card ${shape === 'circle' ? 'rounded-full' : 'rounded-item'}`}>
            <Loader2 size={20} strokeWidth={2} className="animate-spin text-ink-muted" />
          </div>
        ) : currentSrc ? (
          <div className={`group/image relative h-full w-full overflow-hidden ${shape === 'circle' ? 'rounded-full' : 'rounded-item'}`}>
            {/* 统一交互：单击看大图；右键（或右上 ⋯）出菜单做替换 / 编辑 / 移除 / 保存 */}
            <button
              type="button"
              onClick={() => setViewing(true)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenuAt({ x: event.clientX, y: event.clientY })
              }}
              className="absolute inset-0 h-full w-full bg-transparent hover:bg-transparent"
              aria-label="查看图片"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentSrc} alt="" className="h-full w-full object-cover pointer-events-none" />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                setMenuAt({ x: rect.left, y: rect.bottom })
              }}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--oc-scrim)] text-paper-fixed opacity-0 transition-opacity group-hover/image:opacity-100"
              aria-label="图片操作"
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-line bg-paper-card transition-colors hover:border-line-hover ${shape === 'circle' ? 'rounded-full' : 'rounded-item'}`}
          >
            <ImageIcon size={16} strokeWidth={2} className="text-ink-faint" />
            <span className="text-xs text-ink-faint">{placeholderText}</span>
          </button>
        )}
      </div>

      {menuAt ? (
        <div
          className={`${MENU} fixed z-50 flex min-w-32 flex-col`}
          style={{ left: menuAt.x, top: menuAt.y }}
          onMouseLeave={() => setMenuAt(null)}
        >
          <button type="button" className={MENU_ITEM} onClick={() => { setMenuAt(null); void handleClick() }}>
            替换
          </button>
          {enableCrop ? (
            <button type="button" className={MENU_ITEM} onClick={() => { setMenuAt(null); void handleEditExisting() }}>
              编辑
            </button>
          ) : null}
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setMenuAt(null)
              if (value) {
                void downloadMediaFile(value).catch((err: unknown) => {
                  toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
                })
              }
            }}
          >
            保存到…
          </button>
          {onRemove ? (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuAt(null)
                onRemove()
              }}
            >
              移除
            </button>
          ) : null}
        </div>
      ) : null}

      {viewing && value ? (
        <FullscreenViewer images={[value]} initialIndex={0} onClose={() => setViewing(false)} />
      ) : null}

      {rawFileUrl ? (
        <ImageCropper
          open={cropperOpen}
          src={rawFileUrl}
          aspect={effectiveCropAspect}
          shape={effectiveCropShape}
          loading={converting}
          onComplete={handleCropComplete}
          onClose={handleCropperClose}
        />
      ) : null}
    </>
  )
}
