'use client'

/**
 * 动画组件（角色专属，`docs/模板.md §6.11`）—— 一个视频槽。
 *
 * 以前硬编码在「基本信息」里（跟字段行挤在一张网格上），现在独立成块：
 * 可以关、可以拖序，标题文案走模板参数 `label`。
 *
 * 上传 / 预览 / 保存到… / 移除与图片槽位同一套交互（单击或按钮起手，不做假占位）。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Maximize2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { resolveImageUrl } from '@/lib/image-service'
import { useMediaDownload } from '@/lib/use-media-download'
import { uploadAnimation } from '@/lib/video-upload'
import { BTN_QUIET, ICON_BTN } from '@/lib/ui-tokens'
import { ComponentSection } from '../ComponentSection'

/** 桌面看整段动画：深色遮罩里放 `<video controls>`（FullscreenViewer 只收图片） */
function AnimationLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[99999] flex items-center justify-center bg-black/80"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 transition-colors hover:bg-white/30"
      >
        <X size={20} strokeWidth={2} />
      </button>
      <video src={src} controls autoPlay playsInline className="max-h-[90vh] max-w-[90vw] rounded-item" />
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}

export function AnimationBlock({
  value,
  onChange,
  onRemove,
  showTitle = true,
  title = '动画',
}: {
  value: string
  onChange: (path: string) => void
  onRemove: () => void
  showTitle?: boolean
  title?: string
}) {
  const [uploading, setUploading] = useState(false)
  /** 浏览器预览的 blob：只在这里播，**不写库**（刷新即死链） */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const { save, saving } = useMediaDownload()

  const storedUrl = value ? resolveImageUrl(value, 'animation') : null
  const playableUrl = previewUrl ?? storedUrl

  async function handlePick(file: File | undefined): Promise<void> {
    if (file === undefined) return
    setUploading(true)
    try {
      const result = await uploadAnimation(file)
      if (result.ephemeral) {
        // 没有库可写：只在本地预览，刷新即失效，绝不写进表单
        setPreviewUrl(result.path)
        toast('浏览器预览，不会写进库')
      } else {
        setPreviewUrl(null)
        onChange(result.path)
      }
    } catch (error) {
      // 超限 / 类型不对 / 没开库：`video-upload` 抛出的 message 已经是给用户看的一句话
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setUploading(false)
    }
  }

  return (
    <ComponentSection divider={false} title={showTitle ? title : undefined}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {playableUrl ? (
          <>
            <video
              src={playableUrl}
              controls
              preload="metadata"
              playsInline
              className="aspect-video w-40 shrink-0 rounded-item border border-line bg-paper-card object-cover"
            />
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className={`${ICON_BTN} max-md:hidden`}
              aria-label="全屏播放"
              title="全屏播放"
            >
              <Maximize2 size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => void save(playableUrl, '动画.mp4')}
              disabled={saving}
              className={`${ICON_BTN} ${saving ? 'pointer-events-none opacity-50' : ''}`}
              aria-label="保存到…"
              title="保存到…"
            >
              <Download size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className={ICON_BTN}
              aria-label="移除动画"
              title="移除动画"
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          </>
        ) : (
          <label className={`${BTN_QUIET} ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            {uploading ? '上传中…' : '选择动画'}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                // 清掉 input 的值：同一个文件重选也要触发 change
                event.target.value = ''
                void handlePick(file)
              }}
            />
          </label>
        )}
      </div>
      {fullscreen && playableUrl ? (
        <AnimationLightbox src={playableUrl} onClose={() => setFullscreen(false)} />
      ) : null}
    </ComponentSection>
  )
}
