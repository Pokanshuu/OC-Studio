'use client'

/**
 * 分类列表页头 —— 与事件 / 国家列表同构：
 * 桌面「标题 + 搜索 + 排序 / 视图 + 新建」，移动端一条 `MobileFilterBar`（排序 + 新建）。
 *
 * 视图切换在移动端交给 `MobileFab`（和实体列表一致），这里不再重复一枚。
 * 分类名可能很长，标题只截断，不把排序 / 视图挤出页头。
 */
import { Plus } from 'lucide-react'
import { SortSelect, SortViewControls } from '@/components/shared/SortViewControls'
import { DebouncedSearchInput } from '@/components/shared/DebouncedSearchInput'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import {
  BTN_PRIMARY,
  MOBILE_FILTER_BTN,
  PAGE_TITLE,
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
        <div className="flex min-w-0 items-center gap-4">
          <h2 className={`${PAGE_TITLE} max-w-40 truncate md:max-w-56`}>{title}</h2>
          <div className="max-md:hidden md:block">
            <DebouncedSearchInput
              value={search}
              onChange={onSearchChange}
              placeholder={`搜索${title}...`}
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
        <button type="button" onClick={onCreate} className={MOBILE_FILTER_BTN}>
          <Plus size={14} strokeWidth={2} />
          <span>新建</span>
        </button>
      </MobileFilterBar>
    </>
  )
}
