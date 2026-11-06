'use client'

import { Plus, ImageIcon, Loader2 } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'
import { useMediaMenu } from '@/lib/use-media-menu'

interface ImageGalleryGridProps {
  images: string[]
  columns: number
  gridAspect: 'square' | 'portrait' | 'wide'
  addTile: boolean
  onAdd?: (path: string) => void
  onViewImage: (index: number) => void
  onOpenMenu: (index: number, at: { x: number; y: number }) => void
  uploading: boolean
  onUploadClick: () => void
}

/** grid 模式：网格缩略图（可把「添加」做成瓦片） */
export function ImageGalleryGrid({
  images,
  columns,
  gridAspect,
  addTile,
  onAdd,
  onViewImage,
  onOpenMenu,
  uploading,
  onUploadClick,
}: ImageGalleryGridProps) {
  const aspectClass =
    gridAspect === 'portrait' ? 'aspect-[9/16]' : gridAspect === 'wide' ? 'aspect-[3/2]' : 'aspect-square'
  const handlersFor = useMediaMenu<number>((index, at) => {
    if (index !== undefined) onOpenMenu(index, at)
  })

  return (
    <div className="relative">
      {images.length === 0 && !addTile ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-item border border-dashed border-line bg-paper-card">
          <ImageIcon size={20} strokeWidth={2} className="text-ink-faint" />
          <span className="text-xs text-ink-faint">暂无图片</span>
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
        >
          {images.map((url, idx) => (
            <div
              key={idx}
              className={`group relative overflow-hidden rounded-item bg-paper-card ${aspectClass}`}
              {...handlersFor(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(url)}
                alt=""
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => onViewImage(idx)}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/defaults/character-avatar.svg'
                }}
              />
            </div>
          ))}

          {addTile && onAdd ? (
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploading}
              title="添加图片"
              className={`flex items-center justify-center rounded-item border border-dashed border-line bg-paper-card text-ink-faint transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50 ${aspectClass}`}
            >
              {uploading ? (
                <Loader2 size={16} strokeWidth={2} className="animate-spin" />
              ) : (
                <Plus size={16} strokeWidth={2} />
              )}
            </button>
          ) : null}
        </div>
      )}
      {onAdd && !addTile ? (
        <button
          onClick={onUploadClick}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-item border border-dashed border-line bg-paper-card text-sm text-ink-faint transition-colors hover:border-line-hover"
        >
          <Plus size={16} strokeWidth={2} />
          <span>添加图片</span>
        </button>
      ) : null}
    </div>
  )
}
