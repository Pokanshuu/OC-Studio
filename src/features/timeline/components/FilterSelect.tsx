'use client'

import { FilterSelect as SharedFilterSelect } from '@/components/shared/FilterSelect'
import type { FilterOption } from '../types'

/**
 * 时间线筛选下拉 —— 只是共享 `FilterSelect` 的薄封装。
 * 行为（portal / 点外关闭 / 高亮）与菜单样式只有一份实现，这里只固定时间线的密度。
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: FilterOption[]
  placeholder: string
}) {
  return (
    <SharedFilterSelect
      value={value}
      onChange={onChange}
      options={options}
      fallbackLabel={placeholder}
      triggerClassName="touch-feedback flex h-7 items-center gap-1 px-2 text-[12px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:h-8 md:px-2 md:text-[13px]"
      labelClassName="max-w-[120px] truncate"
      chevronSize={16}
    />
  )
}
