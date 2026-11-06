'use client'

import { useRef, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'
import { useMediaDownload } from '@/lib/use-media-download'
import { useMediaMenu } from '@/lib/use-media-menu'
import { Avatar } from './Avatar'
import { ImageCropper } from './ImageCropper'
import { StretchyHeader } from './StretchyHeader'
import { FullscreenViewer } from './FullscreenViewer'
import { MediaContextMenu, type MediaMenuItem } from './MediaContextMenu'
import { MEDIA_IMG } from '@/lib/ui-tokens'

interface ProfileBannerEditorProps {
  headerUrl?: string
  avatarUrl?: string
  onHeaderChange?: (path: string) => void
  onAvatarChange?: (path: string) => void
  onHeaderRemove?: () => void
  onAvatarRemove?: () => void
  avatarType?: 'avatar' | 'flag'
  /** 只画头像（模板里的「头像」组件用它；默认连头图一起画） */
  showHeader?: boolean
}

/**
 * 头图 + 头像 / 徽记。
 *
 * 交互口径与全站图片一致：**单击看大图（没有图时单击选图），右键 / 长按出菜单**。
 * 菜单里做更换 / 编辑 / 保存到… / 删除；图上不再覆盖「更换封面」「更换头像」的遮罩。
 */
export function ProfileBannerEditor({
  headerUrl,
  avatarUrl,
  onHeaderChange,
  onAvatarChange,
  onHeaderRemove,
  onAvatarRemove,
  avatarType = 'avatar',
  showHeader = true,
}: ProfileBannerEditorProps) {
  const headerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [headerRawFileUrl, setHeaderRawFileUrl] = useState<string | null>(null)
  const [headerCropperOpen, setHeaderCropperOpen] = useState(false)
  const [headerConverting, setHeaderConverting] = useState(false)
  const [avatarRawFileUrl, setAvatarRawFileUrl] = useState<string | null>(null)
  const [avatarCropperOpen, setAvatarCropperOpen] = useState(false)
  const [avatarConverting, setAvatarConverting] = useState(false)
  /** 单击看大图（与相册 / 画廊同一口径） */
  const [viewing, setViewing] = useState<{ images: string[]; index: number } | null>(null)
  /** 右键 / 长按菜单：头图与头像共用一套定位 */
  const [menu, setMenu] = useState<{ x: number; y: number; target: 'header' | 'avatar' } | null>(null)
  const { save } = useMediaDownload()

  const handlersFor = useMediaMenu<'header' | 'avatar'>((target, at) => {
    if (target === 'header' && !headerUrl && !onHeaderChange) return
    if (target === 'avatar' && !avatarUrl && !onAvatarChange) return
    if (target) setMenu({ x: at.x, y: at.y, target })
  })

  const headerMenuHandlers = handlersFor('header')
  const avatarMenuHandlers = handlersFor('avatar')

  function viewHeader() {
    if (headerUrl) setViewing({ images: [headerUrl], index: 0 })
    else pickHeader()
  }

  function viewAvatar() {
    if (avatarUrl) setViewing({ images: [avatarUrl], index: 0 })
    else pickAvatar()
  }

  function pickHeader() {
    const input = headerInputRef.current
    if (!input) return
    // 清空 value：同一张图重选也要能触发 change
    input.value = ''
    input.click()
  }

  function pickAvatar() {
    const input = avatarInputRef.current
    if (!input) return
    input.value = ''
    input.click()
  }

  /** 右键菜单里的「编辑」：把已有图取回来重新裁剪（保存后仍走 on*Change 落一个新文件） */
  async function editHeader() {
    if (!headerUrl) return
    try {
      const response = await fetch(resolveImageUrl(headerUrl, 'header'))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (headerRawFileUrl) URL.revokeObjectURL(headerRawFileUrl)
      setHeaderRawFileUrl(URL.createObjectURL(blob))
      setHeaderCropperOpen(true)
    } catch (err) {
      toast.error('取不到原图', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  async function editAvatar() {
    if (!avatarUrl) return
    try {
      const response = await fetch(resolveImageUrl(avatarUrl, avatarType))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (avatarRawFileUrl) URL.revokeObjectURL(avatarRawFileUrl)
      setAvatarRawFileUrl(URL.createObjectURL(blob))
      setAvatarCropperOpen(true)
    } catch (err) {
      toast.error('取不到原图', { description: err instanceof Error ? err.message : String(err) })
    }
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

  const headerSrc = headerUrl ? resolveImageUrl(headerUrl, 'header') : undefined
  const avatarLabel = avatarType === 'flag' ? '旗帜' : '头像'

  const headerItems: MediaMenuItem[] = [
    ...(headerUrl ? [{ label: '查看大图', onSelect: viewHeader }] : []),
    ...(onHeaderChange ? [{ label: '更换封面', onSelect: pickHeader }] : []),
    ...(headerUrl && onHeaderChange ? [{ label: '编辑', onSelect: () => void editHeader() }] : []),
    ...(headerUrl ? [{ label: '保存到…', onSelect: () => void save(headerUrl, '封面.png') }] : []),
    ...(onHeaderRemove && headerUrl
      ? [{ label: '删除封面', danger: true, onSelect: onHeaderRemove }]
      : []),
  ]

  const avatarItems: MediaMenuItem[] = [
    ...(avatarUrl ? [{ label: '查看大图', onSelect: viewAvatar }] : []),
    ...(onAvatarChange ? [{ label: `更换${avatarLabel}`, onSelect: pickAvatar }] : []),
    ...(avatarUrl && onAvatarChange ? [{ label: '编辑', onSelect: () => void editAvatar() }] : []),
    ...(avatarUrl ? [{ label: '保存到…', onSelect: () => void save(avatarUrl, `${avatarLabel}.png`) }] : []),
    ...(onAvatarRemove && avatarUrl
      ? [{ label: `删除${avatarLabel}`, danger: true, onSelect: onAvatarRemove }]
      : []),
  ]

  return (
    <div className="relative w-full">
      <input
        ref={headerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleHeaderFile}
      />

      {/* Header — 弹性头图（下拉拉伸 / 滚动折叠 / 视差都在 StretchyHeader 里） */}
      {showHeader ? (
        <div {...headerMenuHandlers}>
          <StretchyHeader
            className={`rounded-item bg-paper-card ${headerUrl || onHeaderChange ? 'cursor-pointer' : ''}`}
            onClick={headerUrl ? viewHeader : onHeaderChange ? pickHeader : undefined}
          >
            {headerSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerSrc} alt="" className={`${MEDIA_IMG} cursor-zoom-in`} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon size={32} strokeWidth={1.5} className="text-ink-faint opacity-40" />
              </div>
            )}
          </StretchyHeader>
        </div>
      ) : null}

      {/* Avatar */}
      {onAvatarChange ? (
        <div className={showHeader ? 'absolute -bottom-6 left-4' : 'relative w-fit'}>
          <div className="relative inline-block">
            <button
              type="button"
              {...avatarMenuHandlers}
              onClick={viewAvatar}
              className="relative block cursor-pointer bg-transparent hover:bg-transparent"
            >
              <div className="overflow-hidden rounded-full border-4 border-paper"> {/* design-audit-allow border-fat 头像外圈装饰描边 */}
                <Avatar src={avatarUrl} size="lg" type={avatarType} />
              </div>
            </button>
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

      {menu ? (
        <MediaContextMenu
          at={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={menu.target === 'header' ? headerItems : avatarItems}
        />
      ) : null}

      {viewing ? (
        <FullscreenViewer
          images={viewing.images}
          initialIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  )
}
