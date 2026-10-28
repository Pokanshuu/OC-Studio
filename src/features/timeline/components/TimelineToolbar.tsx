'use client'

import { ChevronLeft, ChevronRight, Lock, LockOpen, Plus } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import type { FilterOption } from '../types'
import { FilterSelect } from './FilterSelect'

export function TimelineToolbar({
  filterMajor,
  setFilterMajor,
  editMode,
  onToggleEdit,
  showNav,
  onPrev,
  onNext,
  isFirst,
  isLast,
  showZoom,
  zoomRatio,
  onZoomChange,
  onZoomCommit,
  characterFilter,
  onCharacterFilterChange,
  characterOptions,
  countryFilter,
  onCountryFilterChange,
  countryOptions,
  onAddPeriod,
}: {
  filterMajor: boolean
  setFilterMajor: (v: boolean) => void
  editMode: boolean
  onToggleEdit: () => void
  showNav: boolean
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
  showZoom: boolean
  zoomRatio: number
  onZoomChange: (value: number) => void
  onZoomCommit: (value: number) => void
  characterFilter: number | 'all'
  onCharacterFilterChange: (val: number | 'all') => void
  characterOptions: FilterOption[]
  countryFilter: number | 'all'
  onCountryFilterChange: (val: number | 'all') => void
  countryOptions: FilterOption[]
  onAddPeriod?: () => void
}) {
  return (
    <>
      {/* Desktop toolbar */}
      <div className="max-md:hidden flex h-12 items-center justify-between sticky top-0 z-10 border-b border-line px-6 bg-paper/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <h2 className={PAGE_TITLE}>时间线</h2>
          <div className="-mx-1.5 ml-1 flex items-center gap-1">
            <button
              onClick={() => setFilterMajor(true)}
              className={`h-8 px-1.5 text-[13px] transition-colors ${
                filterMajor ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              大事表
            </button>
            <span className="text-[13px] text-ink-faint/50">/</span>
            <button
              onClick={() => setFilterMajor(false)}
              className={`h-8 px-1.5 text-[13px] transition-colors ${
                !filterMajor ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              全部事件
            </button>
          </div>
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />
          {showNav ? (
            <>
              <button onClick={onPrev} disabled={isFirst}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${isFirst ? 'cursor-default text-ink-faint' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`}
                title="上一个事件"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button onClick={onNext} disabled={isLast}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${isLast ? 'cursor-default text-ink-faint' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`}
                title="下一个事件"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </>
          ) : null}
          {onAddPeriod ? (
            <button onClick={onAddPeriod}
              className={ICON_BTN_MD}
              title="添加时期"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showZoom ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-faint">百年</span>
              <input type="range" min={10} max={500} step={1}
                value={Math.round(zoomRatio * 100)}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                onMouseUp={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                className="h-8 w-32 cursor-pointer appearance-none bg-transparent
                  [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
                  [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
                  [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line
                  [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0"
              />
              <span className="text-[10px] text-ink-faint">年</span>
            </div>
          ) : null}
          <button onClick={onToggleEdit}
            className={`flex h-8 w-8 items-center justify-center transition-colors hover:bg-[var(--oc-hover)] ${editMode ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
            title={editMode ? '锁定时间轴' : '解锁时间轴'}
          >
            {editMode ? <LockOpen size={16} strokeWidth={2} /> : <Lock size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* Mobile filter bar */}
      <MobileFilterBar>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterMajor(true)}
            className={`h-7 text-[12px] transition-colors ${filterMajor ? 'text-ink' : 'text-ink-faint'}`}
          >
            大事表
          </button>
          <span className="text-[12px] text-ink-faint/50">/</span>
          <button
            onClick={() => setFilterMajor(false)}
            className={`h-7 text-[12px] transition-colors ${!filterMajor ? 'text-ink' : 'text-ink-faint'}`}
          >
            全部事件
          </button>
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />
        </div>
        {onAddPeriod ? (
          <button onClick={onAddPeriod}
            className="flex h-7 w-7 items-center justify-center text-ink-muted transition-colors hover:text-ink"
            title="添加时期"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        ) : null}
      </MobileFilterBar>
    </>
  )
}



