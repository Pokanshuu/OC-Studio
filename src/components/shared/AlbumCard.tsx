'use client'

import { useLongPress } from '@/lib/useLongPress'
import type { AlbumEntry } from './useAlbumData'
import { useState } from 'react'
import { getDefaultImage } from '@/lib/image-service'
import { getEntryImageUrl } from './album-utils'
import { MediaContextMenu, type MediaMenuItem } from './MediaContextMenu'
import { useMediaDownload } from '@/lib/use-media-download'

interface AlbumCardProps {
  entry: AlbumEntry
  isMobile: boolean
  onNavigate?: (id: number, type: string) => void
  onLongPress?: () => void
  onViewImage: () => void
}

/**
 * 相册网格里的一张。
 *
 * 口径：**单击看大图，桌面右键出菜单，移动端长按出动作表**。
 * 两边的动作顺序一致（查看 → 保存到… → 跳转），菜单项由这里给，动作表在 `GlobalAlbum`。
 */
export function AlbumCard({
  entry,
  isMobile,
  onNavigate,
  onLongPress,
  onViewImage,
}: AlbumCardProps) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  // 「保存到…」的唯一口：`saving` 防连点，失败自己 toast
  const { save, saving } = useMediaDownload()

  const menuItems: MediaMenuItem[] = isMobile
    ? []
    : [
        { label: '查看大图', onSelect: onViewImage },
        {
          label: saving ? '保存中…' : '保存到…',
          onSelect: () => {
            void save(entry.url, entry.sourceName)
          },
        },
        ...(onNavigate
          ? [{ label: '跳转', onSelect: () => onNavigate(entry.sourceId, entry.sourceType) }]
          : []),
      ]

  return (
    <div
      className="relative"
      onContextMenu={
        menuItems.length > 0
          ? (event) => {
              event.preventDefault()
              setMenuAt({ x: event.clientX, y: event.clientY })
            }
          : undefined
      }
      {...longPress}
    >
      <div className="touch-feedback overflow-hidden rounded-item">
        <img
          src={getEntryImageUrl(entry)}
          alt={entry.sourceName}
          className="aspect-square w-full cursor-pointer object-cover transition-opacity hover:opacity-90"
          onClick={onViewImage}
          onError={(event) => {
            const img = event.currentTarget
            // 源图丢了就回落到占位图：**不要把 alt 文字露出来**（兜底图也失败时才留白）
            if (img.dataset.fallback === '1') return
            img.dataset.fallback = '1'
            img.alt = ''
            img.src = getDefaultImage('avatar')
          }}
        />
      </div>
      <div className="mt-1 truncate text-xs text-ink-faint">{entry.sourceName}</div>

      {menuAt ? (
        <MediaContextMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />
      ) : null}
    </div>
  )
}
