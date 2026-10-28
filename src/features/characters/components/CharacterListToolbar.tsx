'use client'

import { Search, Plus } from 'lucide-react'
import { SortViewControls, SortSelect } from '@/components/shared/SortViewControls'
import type { ViewMode } from '@/components/shared/SortViewControls'
import { BTN_PRIMARY, FILTER_TRIGGER, MOBILE_FILTER_BTN, PAGE_TITLE, SEARCH_ICON, SEARCH_INPUT, TOOLBAR } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { FilterSelect } from '@/components/shared/FilterSelect'
import type { FilterOption } from '@/components/shared/FilterSelect'
import { SORT_OPTIONS } from './character-list-utils'
import type { SortKey } from './character-list-utils'

interface CharacterListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  countryFilter: number | 'all'
  onCountryFilterChange: (value: number | 'all') => void
  countryOptions: FilterOption[]
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onCreateCharacter: () => void
}

/** 列表页头：桌面（标题 + 搜索 + 筛选 + 排序视图 + 新建）与移动端筛选条 */
export function CharacterListToolbar({
  search,
  onSearchChange,
  countryFilter,
  onCountryFilterChange,
  countryOptions,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  onCreateCharacter,
}: CharacterListToolbarProps) {
  return (
    <>
      <div className={TOOLBAR}>
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>角色</h2>
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
              placeholder="搜索角色..."
              className={SEARCH_INPUT}
            />
          </div>
          <FilterSelect
            value={countryFilter}
            onChange={onCountryFilterChange}
            options={countryOptions}
            fallbackLabel="全部国家"
            triggerClassName={FILTER_TRIGGER}
            chevronSize={16}
          />
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => onSortKeyChange(key as SortKey)}
            sortOptions={SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        </div>
        <button
          onClick={onCreateCharacter}
          className={BTN_PRIMARY}
        >
          <Plus size={16} strokeWidth={2} />
          <span>新建角色</span>
        </button>
      </div>

      <MobileFilterBar>
        <div className="flex items-center gap-2">
          <FilterSelect
            value={countryFilter}
            onChange={onCountryFilterChange}
            options={countryOptions}
            fallbackLabel="全部国家"
            triggerClassName={FILTER_TRIGGER}
            chevronSize={16}
          />
          <SortSelect
            sortKey={sortKey}
            onChange={(key) => onSortKeyChange(key as SortKey)}
            options={SORT_OPTIONS}
          />
        </div>
        <button
          onClick={onCreateCharacter}
          className={MOBILE_FILTER_BTN}
        >
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>
    </>
  )
}

