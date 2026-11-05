'use client'

/**
 * 分类列表页头 —— 与角色 / 事件列表同一套形态：
 * 桌面「标题 + 搜索 + 排序 + 新建」，移动端一条 `MobileFilterBar`（排序 + 新建）。
 *
 * 分类条目是普通笔记，没有封面卡，所以不放「卡片 / 画廊 / 列表」三态切换；
 * 其余控件全部复用列表页的共享件，避免这一页长成另一种东西。
 */
import { Plus, Search } from 'lucide-react'
import { SortSelect } from '@/components/shared/SortViewControls'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { CategoryViewToggle } from './CategoryViewToggle'
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
          <SortSelect
            sortKey={sortKey}
            onChange={(key) => onSortKeyChange(key as CategorySortKey)}
            options={CATEGORY_SORT_OPTIONS}
          />
          <CategoryViewToggle viewMode={viewMode} onChange={onViewModeChange} />
        </div>
        <button type="button" onClick={onCreate} className={BTN_PRIMARY}>
          <Plus size={16} strokeWidth={2} />
          <span>新建</span>
        </button>
      </div>

      <MobileFilterBar>
        <SortSelect
          sortKey={sortKey}
          onChange={(key) => onSortKeyChange(key as CategorySortKey)}
          options={CATEGORY_SORT_OPTIONS}
        />
        <div className="flex items-center gap-2">
          <CategoryViewToggle viewMode={viewMode} onChange={onViewModeChange} />
          <button type="button" onClick={onCreate} className={MOBILE_FILTER_BTN}>
            <Plus size={14} strokeWidth={2} />
            <span>新建</span>
          </button>
        </div>
      </MobileFilterBar>
    </>
  )
}
