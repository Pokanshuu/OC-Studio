'use client'

/**
 * 分类条目的卡片态 —— 和角色 / 事件卡片同一套「无边框、靠底色分层」的语言，
 * 只是没有封面图：标题 + 简介 + 自定义字段摘要。
 */
import type { WorldEntry } from '@/types'
import { resolveImageUrl } from '@/lib/image-service'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { EMPTY_HINT, ROUND_ITEM } from '@/lib/ui-tokens'

interface CategoryCardProps {
  entry: WorldEntry
  excerpt: string
  sortable: boolean
  onOpen: (id: number) => void
  onDelete: (entry: WorldEntry) => void
}

export function CategoryCard({ entry, excerpt, sortable, onOpen, onDelete }: CategoryCardProps) {
  const { setNodeRef, style, attributes, listeners } = useSortableItem(entry.id, !sortable)
  const customEntries = Object.entries(entry.custom ?? {})
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value !== '')
    .slice(0, 2)
  const cover = entry.cover ? resolveImageUrl(entry.cover, 'cover') : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex min-w-0 flex-col gap-2 bg-paper-card p-3 transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
    >
      {sortable ? (
        <DragHandle handleProps={{ attributes, listeners }} className="absolute right-2 top-2 z-10" />
      ) : null}

      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- 图片走库内相对路径，静态导出没有 next/image loader
        <img src={cover} alt="" loading="lazy" className={`aspect-[3/2] w-full object-cover ${ROUND_ITEM}`} />
      ) : null}

      <button type="button" onClick={() => onOpen(entry.id)} className={`min-w-0 text-left ${sortable ? 'pr-7' : ''}`}>
        <span className="line-clamp-2 font-serif text-[15px] font-bold leading-snug text-ink">
          {entry.title || '未命名'}
        </span>
        {excerpt ? (
          <span className="mt-1.5 line-clamp-3 block text-[12px] leading-5 text-ink-muted">{excerpt}</span>
        ) : null}
      </button>

      <div className="flex min-w-0 items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {customEntries.map(([key, value]) => (
            <span key={key} className="max-w-full truncate text-[11px] text-ink-faint">
              {key}：{value}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(entry)
          }}
          className={`${EMPTY_HINT} shrink-0 px-1 text-[11px] opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${ROUND_ITEM}`}
        >
          删除
        </button>
      </div>
    </div>
  )
}
