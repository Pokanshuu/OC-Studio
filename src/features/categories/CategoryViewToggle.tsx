'use client'

/**
 * 分类视图切换（目录 / 卡片）。
 *
 * 分类条目没有封面槽位，所以不像角色 / 事件那样有「画廊」第三态；
 * 这里只保留两态，避免点进画廊看到一排没有图的空卡。
 */
import { GalleryHorizontalEnd, LayoutGrid, List } from 'lucide-react'
import { ROUND_ITEM } from '@/lib/ui-tokens'
import type { CategoryViewMode } from './category-list-utils'

export function CategoryViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: CategoryViewMode
  onChange: (mode: CategoryViewMode) => void
}) {
  const modes: { mode: CategoryViewMode; label: string; Icon: typeof LayoutGrid }[] = [
    { mode: 'grid', label: '卡片视图', Icon: LayoutGrid },
    { mode: 'gallery', label: '画廊视图', Icon: GalleryHorizontalEnd },
    { mode: 'list', label: '目录视图', Icon: List },
  ]
  return (
    <div className="flex items-center">
      {modes.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-label={label}
          aria-pressed={viewMode === mode}
          title={label}
          className={`flex h-8 w-8 items-center justify-center transition-colors ${ROUND_ITEM} ${
            viewMode === mode ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
          }`}
        >
          <Icon size={16} strokeWidth={2} />
        </button>
      ))}
    </div>
  )
}
