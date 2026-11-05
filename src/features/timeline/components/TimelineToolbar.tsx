'use client'

/**
 * 时间线的页头（48px）。
 *
 * 一条栏里四件事，按「这行是干什么的」从左到右分组，组与组之间用 1px 竖线隔开：
 *
 *   时间线 │ 大事表 / 全部事件 · 全部角色 · 全部国家 │ ‹ › ＋   …   [简][详] [参与者轨道] │ 缩放 · 导出 · 锁
 *          └──────── 看哪些 ────────┘  └─ 画布操作 ─┘   └── 怎么看 ──┘ └──── 视口与输出 ────┘
 *
 * 两套语法按语义分开，不是随手选的：
 * - **筛选是安静的文字**（大事表 / 全部事件、两个下拉）：它们是「把东西筛掉」，选中只是变墨色
 * - **显示档位是浅底块**（简 / 详、参与者轨道）：它们改的是这张图怎么画，块状才看得出「按得动、
 *   而且是开着的」——和地图控制条的六档同一个语法
 *
 * 简 / 详早先在「视图 › 时间线」菜单里，2026-11-06 搬进这张图自己的工具栏：它们是**这张图的**
 * 显示档位，放在全局菜单里既不顺手、也让人以为影响别的视图。
 */
import { ChevronLeft, ChevronRight, Lock, LockOpen, Plus, ImageDown } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE, ROUND_ITEM } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import type { FilterOption } from '../types'
import { FilterSelect } from './FilterSelect'

/** 组间竖线：只分隔「这一行的四件事」，不画在页头上下（页头的线由外壳给） */
const DIVIDER = 'h-4 w-px shrink-0 bg-line'

/**
 * 简 / 详：两档并排（开关式会逼人记住「另一头是什么」），选中是浅底块。
 */
function DetailSwitch({
  detail,
  onChange,
  compact = false,
}: {
  detail: boolean
  onChange: (value: 'simple' | 'detailed') => void
  compact?: boolean
}) {
  const size = compact ? 'h-7 px-2' : 'h-8 px-2.5'
  const option = (value: 'simple' | 'detailed', label: string) => {
    const active = (value === 'detailed') === detail
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        aria-pressed={active}
        className={`${size} shrink-0 text-[12px] transition-colors ${ROUND_ITEM} ${
          active
            ? 'bg-[var(--oc-hover)] text-ink'
            : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
        }`}
      >
        {label}
      </button>
    )
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {option('simple', '简')}
      {option('detailed', '详')}
    </div>
  )
}

/** 参与者轨道：那条横带铺不铺。开着是浅底块 —— 单看文字分不出「关着」还是「不能点」 */
function TrackToggle({
  on,
  onToggle,
  compact = false,
}: {
  on: boolean
  onToggle: () => void
  compact?: boolean
}) {
  const size = compact ? 'h-7 px-2' : 'h-8 px-2.5'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`${size} flex shrink-0 items-center text-[12px] transition-colors ${ROUND_ITEM} ${
        on
          ? 'bg-[var(--oc-hover)] text-ink'
          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
      }`}
    >
      参与者轨道
    </button>
  )
}

export function TimelineToolbar({
  filterMajor,
  setFilterMajor,
  editMode,
  onToggleEdit,
  detail,
  onDetailChange,
  showTracks,
  onToggleTracks,
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
  onExport,
}: {
  filterMajor: boolean
  setFilterMajor: (v: boolean) => void
  editMode: boolean
  onToggleEdit: () => void
  /** 详模式（第二行显示时间 · 参与者） */
  detail: boolean
  onDetailChange: (value: 'simple' | 'detailed') => void
  /** 是否铺参与者轨道 */
  showTracks: boolean
  onToggleTracks: () => void
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
  /** 打开导出中心（时间线页签） */
  onExport?: () => void
}) {
  return (
    <>
      {/* Desktop toolbar */}
      <div className="max-md:hidden flex h-12 items-center justify-between sticky top-0 z-10 border-b border-line px-6 bg-paper/85 backdrop-blur-lg">
        {/* 左：看哪些 · 画布操作 */}
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={`${PAGE_TITLE} mr-1 shrink-0`}>时间线</h2>

          {/* 「看哪些」：范围 + 两个筛选，同一组里不加线 */}
          <button
            onClick={() => setFilterMajor(true)}
            className={`h-8 shrink-0 px-1.5 text-[13px] transition-colors ${
              filterMajor ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
            }`}
          >
            大事表
          </button>
          <span className="text-[13px] text-ink-faint/50">/</span>
          <button
            onClick={() => setFilterMajor(false)}
            className={`h-8 shrink-0 px-1.5 text-[13px] transition-colors ${
              !filterMajor ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
            }`}
          >
            全部事件
          </button>
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />

          {showNav || onAddPeriod ? <span className={DIVIDER} aria-hidden /> : null}

          {/* 画布操作：在两个事件之间跳 · 加一个时期 */}
          {showNav ? (
            <>
              <button onClick={onPrev} disabled={isFirst}
                className={`flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${isFirst ? 'cursor-default text-ink-faint' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`}
                title="上一个事件"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button onClick={onNext} disabled={isLast}
                className={`flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${isLast ? 'cursor-default text-ink-faint' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`}
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

        {/* 右：怎么看 · 视口与输出 */}
        <div className="flex shrink-0 items-center gap-2">
          <DetailSwitch detail={detail} onChange={onDetailChange} />
          <TrackToggle on={showTracks} onToggle={onToggleTracks} />

          <span className={DIVIDER} aria-hidden />

          {showZoom ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-faint">百年</span>
              <input type="range" min={10} max={500} step={1}
                aria-label="时间跨度"
                value={Math.round(zoomRatio * 100)}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                onMouseUp={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                className="h-8 w-24 cursor-pointer appearance-none bg-transparent
                  [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
                  [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
                  [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line
                  [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0"
              />
              <span className="text-[11px] text-ink-faint">年</span>
            </div>
          ) : null}
          {onExport ? (
            <button onClick={onExport}
              className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
              title="导出图片…"
              aria-label="导出图片"
            >
              <ImageDown size={16} strokeWidth={2} />
            </button>
          ) : null}
          <button onClick={onToggleEdit}
            className={`flex h-8 w-8 items-center justify-center transition-colors hover:bg-[var(--oc-hover)] ${editMode ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
            title={editMode ? '锁定时间轴' : '解锁时间轴'}
          >
            {editMode ? <LockOpen size={16} strokeWidth={2} /> : <Lock size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* Mobile filter bar：筛选 + 两个显示档位排成一行，放不下就横向滚（窄屏不能把它们挤没） */}
      <MobileFilterBar>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilterMajor(true)}
            className={`h-7 shrink-0 text-[12px] transition-colors ${filterMajor ? 'text-ink' : 'text-ink-faint'}`}
          >
            大事表
          </button>
          <span className="text-[12px] text-ink-faint/50">/</span>
          <button
            onClick={() => setFilterMajor(false)}
            className={`h-7 shrink-0 text-[12px] transition-colors ${!filterMajor ? 'text-ink' : 'text-ink-faint'}`}
          >
            全部事件
          </button>
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />
          <DetailSwitch detail={detail} onChange={onDetailChange} compact />
          <TrackToggle on={showTracks} onToggle={onToggleTracks} compact />
        </div>
        {onAddPeriod ? (
          <button onClick={onAddPeriod}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted transition-colors hover:text-ink"
            title="添加时期"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        ) : null}
      </MobileFilterBar>
    </>
  )
}
