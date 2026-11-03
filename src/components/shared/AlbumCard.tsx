'use client'

import { useLongPress } from '@/lib/useLongPress'
import type { AlbumEntry } from './useAlbumData'
import { useState } from 'react'
import { getEntryImageUrl } from './album-utils'
import { MediaContextMenu, type MediaMenuItem } from './MediaContextMenu'
import { downloadMediaFile } from '@/lib/media-download'
import { toast } from 'sonner'

interface AlbumCardProps {
  entry: AlbumEntry
  isMobile: boolean
  onNavigate?: (id: number, type: string) => void
  onLongPress?: () => void
  onViewImage: () => void
}

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

  const menuItems: MediaMenuItem[] = isMobile
    ? []
    : [
        { label: '查看', onSelect: onViewImage },
        {
          label: '保存到…',
          onSelect: () => {
            void downloadMediaFile(entry.url, entry.sourceName).catch((err: unknown) => {
              toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
            })
          },
        },
        ...(onNavigate
          ? [{ label: '跳转', onSelect: () => onNavigate(entry.sourceId, entry.sourceType) }]
          : []),
      ]

  return (
    <div
      className="group relative"
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
      <img
        src={getEntryImageUrl(entry)}
        alt={entry.sourceName}
        className="touch-feedback aspect-square w-full cursor-pointer object-cover transition-opacity hover:opacity-90"
        onClick={onViewImage}
      />
      <div className="mt-1 truncate text-xs text-ink-faint">
        {entry.sourceName}
        {onNavigate && !isMobile ? (
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(entry.sourceId, entry.sourceType) }}
              className="ml-1 text-ink-muted hover:text-ink"
            >
              跳转
            </button>
          </span>
        ) : null}
      </div>

      {menuAt ? (
        <MediaContextMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />
      ) : null}
    </div>
  )
}
