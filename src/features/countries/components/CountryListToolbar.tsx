'use client'

import { Search, Plus } from 'lucide-react'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { BTN_PRIMARY, MOBILE_FILTER_BTN, PAGE_TITLE, SEARCH_ICON, SEARCH_INPUT, TOOLBAR } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { COUNTRY_SORT_OPTIONS } from './country-list-utils'
import type { CountrySortKey } from './country-list-utils'

interface CountryListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  sortKey: CountrySortKey
  onSortKeyChange: (key: CountrySortKey) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onCreateCountry: () => void
}

/** 列表页头：桌面（标题 + 搜索 + 排序视图 + 新建）与移动端筛选条 */
export function CountryListToolbar({
  search,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  onCreateCountry,
}: CountryListToolbarProps) {
  return (
    <>
      <div className={TOOLBAR}>
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>国家</h2>
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
              placeholder="搜索国家..."
              className={SEARCH_INPUT}
            />
          </div>
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => onSortKeyChange(key as CountrySortKey)}
            sortOptions={COUNTRY_SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        </div>
        <button
          onClick={onCreateCountry}
          className={BTN_PRIMARY}
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建国家</span>
        </button>
      </div>

      <MobileFilterBar>
        <SortSelect
          sortKey={sortKey}
          onChange={(key) => onSortKeyChange(key as CountrySortKey)}
          options={COUNTRY_SORT_OPTIONS}
        />
        <button
          onClick={onCreateCountry}
          className={MOBILE_FILTER_BTN}
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>
    </>
  )
}
