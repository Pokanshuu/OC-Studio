'use client'

import { Search, Plus } from 'lucide-react'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { PAGE_TITLE } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { SORT_OPTIONS } from './event-list-utils'
import type { SortKey } from './event-list-utils'

interface EventListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onCreateEvent: () => void
}

/** 列表页头：桌面（标题 + 搜索 + 排序视图 + 新建）与移动端筛选条 */
export function EventListToolbar({
  search,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  onCreateEvent,
}: EventListToolbarProps) {
  return (
    <>
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 h-12 border-b border-line px-6 bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>事件</h2>
          <div className="relative max-md:hidden md:block">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索事件..."
              className="h-8 w-44 border-b border-transparent bg-transparent pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
            />
          </div>
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => onSortKeyChange(key as SortKey)}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        </div>
        <button
          onClick={onCreateEvent}
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85"
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建事件</span>
        </button>
      </div>

      <MobileFilterBar>
        <SortSelect
          sortKey={sortKey}
          onChange={(key) => onSortKeyChange(key as SortKey)}
          options={SORT_OPTIONS}
        />
        <button
          onClick={onCreateEvent}
          className="touch-feedback flex items-center gap-1 bg-paper/85 px-2 py-1 text-[11px] text-ink-muted backdrop-blur transition-colors hover:text-ink"
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>
    </>
  )
}
