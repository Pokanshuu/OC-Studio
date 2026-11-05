'use client'

/**
 * 分类列表的一行 —— 和角色 / 事件列表一样，行本身就是排序节点。
 * 只有「手动排序」时左侧才出现手柄；其余排法下手柄不占位。
 */
import type { WorldEntry } from '@/types'
import { resolveImageUrl } from '@/lib/image-service'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { EMPTY_HINT, ROUND_ITEM } from '@/lib/ui-tokens'

interface CategoryRowProps {
  entry: WorldEntry
  excerpt: string
  sortable: boolean
  onOpen: (id: number) => void
  onDelete: (entry: WorldEntry) => void
}

export function CategoryRow({ entry, excerpt, sortable, onOpen, onDelete }: CategoryRowProps) {
  const { setNodeRef, style, attributes, listeners } = useSortableItem(entry.id, !sortable)
  const cover = entry.cover ? resolveImageUrl(entry.cover, 'cover') : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="row-rule group relative flex items-center"
    >
      {sortable ? <DragHandle handleProps={{ attributes, listeners }} className="ml-1 shrink-0" /> : null}
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        className={`flex w-full min-w-0 items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader
          <img src={cover} alt="" loading="lazy" className={`h-9 w-14 shrink-0 object-cover ${ROUND_ITEM}`} />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{entry.title || '未命名'}</span>
          {excerpt ? (
            <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{excerpt}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete(entry)
        }}
        className={`${EMPTY_HINT} shrink-0 px-2 text-[11px] opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${ROUND_ITEM}`}
      >
        删除
      </button>
    </div>
  )
}
