'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Camera, Trash2 } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'
import { Avatar } from './Avatar'
import { ImageCropper } from './ImageCropper'
import { StretchyHeader } from './StretchyHeader'
import { MEDIA_IMG } from '@/lib/ui-tokens'

interface ProfileBannerEditorProps {
  headerUrl?: string
  avatarUrl?: string
  onHeaderChange?: (path: string) => void
  onAvatarChange?: (path: string) => void
  onHeaderRemove?: () => void
  onAvatarRemove?: () => void
  avatarType?: 'avatar' | 'flag'
}

export function ProfileBannerEditor({
  headerUrl,
  avatarUrl,
  onHeaderChange,
  onAvatarChange,
  onHeaderRemove,
  onAvatarRemove,
  avatarType = 'avatar',
}: ProfileBannerEditorProps) {
  const headerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [headerRawFileUrl, setHeaderRawFileUrl] = useState<string | null>(null)
  const [headerCropperOpen, setHeaderCropperOpen] = useState(false)
  const [headerConverting, setHeaderConverting] = useState(false)
  const [avatarRawFileUrl, setAvatarRawFileUrl] = useState<string | null>(null)
  const [avatarCropperOpen, setAvatarCropperOpen] = useState(false)
  const [avatarConverting, setAvatarConverting] = useState(false)

  const headerSrc = headerUrl ? resolveImageUrl(headerUrl) : undefined

  function pickHeader() {
    const input = headerInputRef.current
    if (!input) return
    // 清空 value：同一张图重选也要能触发 change
    input.value = ''
    input.click()
  }

  function handleHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onHeaderChange) return
    if (headerRawFileUrl) URL.revokeObjectURL(headerRawFileUrl)
    // 立即打开裁剪器，后台异步转换 HEIF
    const initialUrl = URL.createObjectURL(file)
    setHeaderRawFileUrl(initialUrl)
    setHeaderCropperOpen(true)
    setHeaderConverting(true)
    convertHeifToJpeg(file).then((converted) => {
      URL.revokeObjectURL(initialUrl)
      setHeaderRawFileUrl(URL.createObjectURL(converted))
      setHeaderConverting(false)
    }).catch((err) => {
      console.warn('[ProfileBannerEditor] header HEIF conversion failed:', err)
      setHeaderConverting(false)
    })
  }

  async function handleHeaderCropComplete(blob: Blob) {
    const url = await saveBlobToDisk(blob, 'header')
    onHeaderChange?.(url)
    setHeaderCropperOpen(false)
    if (headerRawFileUrl) {
      URL.revokeObjectURL(headerRawFileUrl)
      setHeaderRawFileUrl(null)
    }
  }

  function handleHeaderCropperClose() {
    setHeaderCropperOpen(false)
    setHeaderConverting(false)
    if (headerRawFileUrl) {
      URL.revokeObjectURL(headerRawFileUrl)
      setHeaderRawFileUrl(null)
    }
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onAvatarChange) return
    if (avatarRawFileUrl) URL.revokeObjectURL(avatarRawFileUrl)
    // 立即打开裁剪器，后台异步转换 HEIF
    const initialUrl = URL.createObjectURL(file)
    setAvatarRawFileUrl(initialUrl)
    setAvatarCropperOpen(true)
    setAvatarConverting(true)
    convertHeifToJpeg(file).then((converted) => {
      URL.revokeObjectURL(initialUrl)
      setAvatarRawFileUrl(URL.createObjectURL(converted))
      setAvatarConverting(false)
    }).catch((err) => {
      console.warn('[ProfileBannerEditor] avatar HEIF conversion failed:', err)
      setAvatarConverting(false)
    })
  }

  async function handleAvatarCropComplete(blob: Blob) {
    const url = await saveBlobToDisk(blob, 'avatar')
    onAvatarChange?.(url)
    setAvatarCropperOpen(false)
    if (avatarRawFileUrl) {
      URL.revokeObjectURL(avatarRawFileUrl)
      setAvatarRawFileUrl(null)
    }
  }

  function handleAvatarCropperClose() {
    setAvatarCropperOpen(false)
    setAvatarConverting(false)
    if (avatarRawFileUrl) {
      URL.revokeObjectURL(avatarRawFileUrl)
      setAvatarRawFileUrl(null)
    }
  }

  return (
    <div className="relative w-full">
      {/* Header — 弹性头图（下拉拉伸 / 滚动折叠 / 视差都在 StretchyHeader 里） */}
      <StretchyHeader
        className={`group/header rounded-item bg-paper-card ${onHeaderChange ? 'cursor-pointer' : ''}`}
        onClick={onHeaderChange ? pickHeader : undefined}
        overlay={
          onHeaderChange ? (
            <>
              <input
                ref={headerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleHeaderFile}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-white opacity-0 transition-opacity group-hover/header:opacity-100">
                <button
                  onClick={pickHeader}
                  className="pointer-events-auto flex items-center gap-1.5 bg-transparent hover:bg-transparent"
                >
                  <Camera size={18} strokeWidth={2} />
                  更换头图
                </button>
              </div>
              {onHeaderRemove && headerUrl ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onHeaderRemove() }}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 transition-opacity group-hover/header:opacity-100 hover:bg-black/60"
                  title="删除头图"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {headerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headerSrc}
            alt=""
            className={MEDIA_IMG}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon size={32} strokeWidth={1.5} className="text-ink-faint opacity-40" />
          </div>
        )}
      </StretchyHeader>

      {/* Avatar */}
      {onAvatarChange ? (
        <div className="absolute -bottom-6 left-4">
          <div className="group/avatar relative inline-block">
            <button
              type="button"
              onClick={() => { if (avatarInputRef.current) { avatarInputRef.current.value = ''; avatarInputRef.current.click() } }}
              className="relative block bg-transparent hover:bg-transparent"
            >
              <div className="overflow-hidden rounded-full border-4 border-paper"> {/* design-audit-allow border-fat 头像外圈装饰描边 */}
                <Avatar src={avatarUrl} size="lg" type={avatarType} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover/avatar:bg-black/30 group-hover/avatar:opacity-100 group-hover/avatar:text-xs group-hover/avatar:text-white">
                <Camera size={14} strokeWidth={2} />
              </div>
            </button>
            {onAvatarRemove && avatarUrl ? (
              <button
                onClick={(e) => { e.stopPropagation(); onAvatarRemove() }}
                className="absolute -right-1 -top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 transition-opacity group-hover/avatar:opacity-100 hover:bg-black/60"
                title="删除头像"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
        </div>
      ) : null}

      {/* Crop modals */}
      {headerRawFileUrl ? (
        <ImageCropper
          open={headerCropperOpen}
          src={headerRawFileUrl}
          aspect={3/2}
          shape="rect"
          loading={headerConverting}
          onComplete={handleHeaderCropComplete}
          onClose={handleHeaderCropperClose}
        />
      ) : null}

      {avatarRawFileUrl ? (
        <ImageCropper
          open={avatarCropperOpen}
          src={avatarRawFileUrl}
          aspect={1}
          shape="round"
          loading={avatarConverting}
          onComplete={handleAvatarCropComplete}
          onClose={handleAvatarCropperClose}
        />
      ) : null}
    </div>
  )
}
