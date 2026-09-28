'use client'

import { useLongPress } from '@/lib/useLongPress'
import type { AlbumEntry } from './useAlbumData'
import { getEntryImageUrl } from './album-utils'

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

  return (
    <div className="group relative" {...longPress}>
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
    </div>
  )
}
