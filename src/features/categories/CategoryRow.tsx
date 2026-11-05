'use client'

/**
 * 分类列表的一行 —— 与角色 / 事件 / 国家列表同一套行：
 * 整行可点、左侧可挂拖拽手柄、标题下是「编辑于 …」、右侧悬停出删除。
 *
 * 以前这里是一枚窄按钮 + 常驻「删除」文字，标题没有时间、行高和事件列表也对不上；
 * 分类条目不是另一种东西，别让它长成另一套列表。
 */
import type { WorldEntry } from '@/types'
import { resolveImageUrl } from '@/lib/image-service'
import { formatRelativeTime } from '@/lib/relative-time'
import { useLongPress } from '@/lib/useLongPress'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { DRAG_SLOT_ROW, ROW_ACTIONS, ROUND_ITEM } from '@/lib/ui-tokens'

interface CategoryRowProps {
  entry: WorldEntry
  excerpt: string
  sortable: boolean
  isMobile: boolean
  onOpen: (id: number) => void
  onDelete: (entry: WorldEntry) => void
  onLongPress?: () => void
}

export function CategoryRow({
  entry,
  excerpt,
  sortable,
  isMobile,
  onOpen,
  onDelete,
  onLongPress,
}: CategoryRowProps) {
  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(entry.id, !sortable)
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })
  const cover = entry.cover ? resolveImageUrl(entry.cover, 'cover') : null

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') onOpen(entry.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={longPressSort ? { ...style, touchAction: 'none' } : style}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-4 rounded-item py-3 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'} ${longPressSort ? 'touch-none' : ''}`}
      {...longPress}
      {...cardAttributes}
      {...cardListeners}
    >
      {sortable ? (
        <div className={DRAG_SLOT_ROW}>
          <DragHandle handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader
        <img src={cover} alt="" loading="lazy" className={`h-9 w-14 shrink-0 object-cover ${ROUND_ITEM}`} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{entry.title || '未命名'}</h3>
        <span className="truncate text-xs text-ink-faint">
          编辑于 {formatRelativeTime(entry.updatedAt)}
        </span>
      </div>
      {excerpt ? (
        <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">{excerpt}</p>
      ) : null}
      {!isMobile ? (
        <div className={ROW_ACTIONS}>
          <DeleteButton onDelete={() => onDelete(entry)} />
        </div>
      ) : null}
    </div>
  )
}
