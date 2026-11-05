'use client'

/**
 * 分类列表页头 —— 与角色 / 事件列表同一套形态：
 * 桌面「标题 + 搜索 + 排序 + 视图 + 新建」，移动端一条 `MobileFilterBar`。
 *
 * 排序、视图切换、新建全部复用共享件（`SortViewControls` / `ViewToggle`），
 * 不再单独维护一份分类专用的图标组。
 */
import { Plus, Search } from 'lucide-react'
import { SortSelect, SortViewControls, ViewToggle } from '@/components/shared/SortViewControls'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import {
  BTN_PRIMARY,
  MOBILE_FILTER_BTN,
  PAGE_TITLE,
  SEARCH_ICON,
  SEARCH_INPUT,
  TOOLBAR,
} from '@/lib/ui-tokens'
import {
  CATEGORY_SORT_OPTIONS,
  type CategorySortKey,
  type CategoryViewMode,
} from './category-list-utils'

interface CategoryListToolbarProps {
  title: string
  search: string
  onSearchChange: (value: string) => void
  sortKey: CategorySortKey
  onSortKeyChange: (key: CategorySortKey) => void
  viewMode: CategoryViewMode
  onViewModeChange: (mode: CategoryViewMode) => void
  onCreate: () => void
}

export function CategoryListToolbar({
  title,
  search,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  viewMode,
  onViewModeChange,
  onCreate,
}: CategoryListToolbarProps) {
  return (
    <>
      <div className={TOOLBAR}>
        <div className="flex items-center gap-4">
          <h2 className={PAGE_TITLE}>{title}</h2>
          <div className="relative max-md:hidden md:block">
            <Search size={16} strokeWidth={2} className={SEARCH_ICON} />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`搜索${title}...`}
              className={SEARCH_INPUT}
            />
          </div>
          <SortViewControls
            sortKey={sortKey}
            onSortChange={(key) => onSortKeyChange(key as CategorySortKey)}
            sortOptions={CATEGORY_SORT_OPTIONS}
            viewMode={viewMode}
            onViewModeChange={(mode) => onViewModeChange(mode as CategoryViewMode)}
          />
        </div>
        <button type="button" onClick={onCreate} className={BTN_PRIMARY}>
          <Plus size={16} strokeWidth={2} />
          <span>新建条目</span>
        </button>
      </div>

      <MobileFilterBar>
        <SortSelect
          sortKey={sortKey}
          onChange={(key) => onSortKeyChange(key as CategorySortKey)}
          options={CATEGORY_SORT_OPTIONS}
        />
        <div className="flex items-center gap-2">
          <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          <button type="button" onClick={onCreate} className={MOBILE_FILTER_BTN}>
            <Plus size={14} strokeWidth={2} />
            <span>新建</span>
          </button>
        </div>
      </MobileFilterBar>
    </>
  )
}
