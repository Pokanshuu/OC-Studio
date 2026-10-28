'use client'

import { Search, Plus } from 'lucide-react'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { BTN_PRIMARY, MOBILE_FILTER_BTN, PAGE_TITLE, SEARCH_ICON, SEARCH_INPUT, TOOLBAR } from '@/lib/ui-tokens'
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
      <div className={TOOLBAR}>
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>事件</h2>
          <div className="relative max-md:hidden md:block">
            <Search
              size={16}
              strokeWidth={2}
              className={SEARCH_ICON}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索事件..."
              className={SEARCH_INPUT}
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
          className={BTN_PRIMARY}
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
          className={MOBILE_FILTER_BTN}
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>
    </>
  )
}
