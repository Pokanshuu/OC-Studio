'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Camera, Trash2 } from 'lucide-react'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { Avatar } from './Avatar'
import { ImageCropper } from './ImageCropper'

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
  const [avatarRawFileUrl, setAvatarRawFileUrl] = useState<string | null>(null)
  const [avatarCropperOpen, setAvatarCropperOpen] = useState(false)

  const headerSrc = headerUrl ? resolveImageUrl(headerUrl) : undefined

  function handleHeaderFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onHeaderChange) return
    if (headerRawFileUrl) URL.revokeObjectURL(headerRawFileUrl)
    setHeaderRawFileUrl(URL.createObjectURL(file))
    setHeaderCropperOpen(true)
    if (headerInputRef.current) headerInputRef.current.value = ''
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
    if (headerRawFileUrl) {
      URL.revokeObjectURL(headerRawFileUrl)
      setHeaderRawFileUrl(null)
    }
  }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onAvatarChange) return
    if (avatarRawFileUrl) URL.revokeObjectURL(avatarRawFileUrl)
    setAvatarRawFileUrl(URL.createObjectURL(file))
    setAvatarCropperOpen(true)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
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
    if (avatarRawFileUrl) {
      URL.revokeObjectURL(avatarRawFileUrl)
      setAvatarRawFileUrl(null)
    }
  }

  return (
    <div className="relative w-full">
      {/* Header — CSS intrinsic ratio */}
      <div
        className="group/header relative w-full overflow-hidden rounded-lg bg-paper-card aspect-[3/1]"
      >
        {headerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headerSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon size={32} strokeWidth={1.5} className="text-ink-faint opacity-40" />
          </div>
        )}

        {onHeaderChange ? (
          <>
            <input
              ref={headerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHeaderFile}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-white opacity-0 transition-opacity group-hover/header:opacity-100 pointer-events-none">
              <button
                onClick={() => headerInputRef.current?.click()}
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
        ) : null}
      </div>

      {/* Avatar */}
      {onAvatarChange ? (
        <div className="absolute -bottom-6 left-4">
          <div className="group/avatar relative inline-block">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative block bg-transparent hover:bg-transparent"
            >
              <div className="overflow-hidden rounded-full border-[4px] border-paper dark:border-[#1C1B1A]">
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
          aspect={3}
          shape="rect"
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
          onComplete={handleAvatarCropComplete}
          onClose={handleAvatarCropperClose}
        />
      ) : null}
    </div>
  )
}
