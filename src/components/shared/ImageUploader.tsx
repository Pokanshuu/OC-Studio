'use client'

import { useRef, useState } from 'react'
import { ImageIcon, MoreHorizontal, Loader2 } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'
import { useMediaDownload } from '@/lib/use-media-download'
import { useMediaMenu } from '@/lib/use-media-menu'
import { ImageCropper } from './ImageCropper'
import { FullscreenViewer } from './FullscreenViewer'
import { MediaContextMenu, type MediaMenuItem } from './MediaContextMenu'
import { OverlayIconButton } from './OverlayIconButton'
import { toast } from 'sonner'

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

/**
 * 单图槽位（封面 / 头像 / 世界封面 / 小说封面）。
 * 交互与画廊 / 头图一致：**单击看大图，右键或长按出菜单**（更换 / 编辑 / 保存到… / 移除）。
 */
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
  const { save } = useMediaDownload()

  const currentSrc = value ? resolveImageUrl(value) : undefined
  const effectiveCropAspect = cropAspect ?? ASPECT_RATIO_MAP[aspectRatio] ?? 1
  const effectiveCropShape = cropShape ?? (effectiveCropAspect === 1 ? 'round' : 'rect')
  const handlersFor = useMediaMenu<never>((_, at) => setMenuAt(at))
  const imageMenuHandlers = handlersFor()

  async function handleClick() {
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click() }
  }

  /** 右键菜单的「编辑」：把已有图取回来丢进裁剪器（只有开了裁剪的槽位才有） */
  async function handleEditExisting() {
    if (!currentSrc) return
    try {
      const response = await fetch(currentSrc)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
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

  const menuItems: MediaMenuItem[] = [
    { label: '查看大图', onSelect: () => setViewing(true) },
    { label: '更换', onSelect: () => void handleClick() },
    ...(enableCrop ? [{ label: '编辑', onSelect: () => void handleEditExisting() }] : []),
    {
      label: '保存到…',
      onSelect: () => {
        if (value) void save(value, '图片.png')
      },
    },
    ...(onRemove ? [{ label: '移除', danger: true, onSelect: onRemove }] : []),
  ]

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
            {/* 单击看大图；右键 / 长按出菜单（更换 / 编辑 / 保存 / 移除） */}
            <button
              type="button"
              {...imageMenuHandlers}
              onClick={() => setViewing(true)}
              className="absolute inset-0 h-full w-full cursor-zoom-in bg-transparent hover:bg-transparent"
              aria-label="查看图片"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentSrc} alt="" className="h-full w-full object-cover pointer-events-none" />
            <span className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/image:opacity-100">
              <OverlayIconButton
                label="图片操作"
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenuAt({ x: rect.left, y: rect.bottom })
                }}
              >
                <MoreHorizontal size={14} strokeWidth={2} />
              </OverlayIconButton>
            </span>
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
        <MediaContextMenu at={menuAt} onClose={() => setMenuAt(null)} items={menuItems} />
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
