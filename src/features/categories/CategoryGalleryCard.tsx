'use client'

/**
 * 画廊视图里的大卡：封面铺满上半，标题 / 简介落在下半。
 * 没有封面时退回纸底 + 衬线首字，和角色 / 事件画廊的「无图占位」同一语言。
 */
import type { WorldEntry } from '@/types'
import { resolveImageUrl } from '@/lib/image-service'
import { EMPTY_HINT, ROUND_ITEM } from '@/lib/ui-tokens'

export function CategoryGalleryCard({
  entry,
  excerpt,
  onOpen,
  onDelete,
}: {
  entry: WorldEntry
  excerpt: string
  onOpen: (id: number) => void
  onDelete: (entry: WorldEntry) => void
}) {
  const cover = entry.cover ? resolveImageUrl(entry.cover, 'cover') : null
  const initial = (entry.title || '未').trim().slice(0, 1)

  return (
    <div className={`group relative flex aspect-[3/2] h-full w-full flex-col overflow-hidden bg-paper-card ${ROUND_ITEM}`}>
      <button type="button" onClick={() => onOpen(entry.id)} className="flex h-full w-full flex-col text-left">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-paper-alt">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-serif text-3xl text-ink-faint">
              {initial}
            </span>
          )}
        </div>
        <div className="shrink-0 px-3 py-2">
          <span className="block truncate font-serif text-[15px] font-bold text-ink">
            {entry.title || '未命名'}
          </span>
          {excerpt ? (
            <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{excerpt}</span>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete(entry)
        }}
        className={`${EMPTY_HINT} absolute right-2 top-2 px-1 text-[11px] opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${ROUND_ITEM}`}
      >
        删除
      </button>
    </div>
  )
}
