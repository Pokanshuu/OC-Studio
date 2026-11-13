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
 *
 * **窄了就收口**（2026-11-10）：整行交给 `OverflowBar` 量宽度，放不下的条目收进一个「…」菜单。
 * 以前是左组 `min-w-0` + 子项 `shrink-0`，窗口一窄左边的筛选就压到右边的图标上。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, LockOpen, Plus, ImageDown } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE, ROUND_ITEM } from '@/lib/ui-tokens'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { OverflowBar, type OverflowEntry } from '@/components/shared/OverflowBar'
import type { ToolbarMenuGroup, ToolbarMenuItem } from '@/components/editor/ToolbarMenu'
import type { FilterOption } from '../types'
import { FilterSelect } from './FilterSelect'

/** 组间竖线：只分隔「这一行的四件事」，不画在页头上下（页头的线由外壳给） */
const DIVIDER = 'h-4 w-px shrink-0 bg-line'

/**
 * 缩放滑杆。
 *
 * 滑块**自己**持有拖动中的值：缩放要经过 `startTransition` 和画布重排，
 * 受控值跟着它走会让原生滑块每帧被 React 拉回旧位置，表现就是「疯狂抖动」。
 * 拖动时只更新本地值；滚动 / 捏合 / 菜单改缩放时再由外部值同步回来。
 */
function ZoomSlider({
  zoomRatio,
  onChange,
  onCommit,
}: {
  zoomRatio: number
  onChange: (percent: number) => void
  onCommit: (percent: number) => void
}) {
  const [local, setLocal] = useState(() => Math.round(zoomRatio * 100))
  const draggingRef = useRef(false)
  const rafRef = useRef(0)
  const pendingRef = useRef(local)

  useEffect(() => {
    if (!draggingRef.current) setLocal(Math.round(zoomRatio * 100))
  }, [zoomRatio])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  const schedule = (next: number) => {
    pendingRef.current = next
    if (rafRef.current !== 0) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      onChange(pendingRef.current)
    })
  }

  const commit = (next: number) => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    onChange(next)
    onCommit(next)
  }

  return (
    <input type="range" min={10} max={500} step={1}
      aria-label="时间跨度"
      value={local}
      onChange={(e) => {
        const next = Number(e.currentTarget.value)
        setLocal(next)
        schedule(next)
      }}
      onPointerDown={() => { draggingRef.current = true }}
      onPointerUp={(e) => {
        draggingRef.current = false
        commit(Number(e.currentTarget.value))
      }}
      onPointerCancel={(e) => {
        draggingRef.current = false
        commit(Number(e.currentTarget.value))
      }}
      onKeyUp={(e) => commit(Number(e.currentTarget.value))}
      className="h-8 w-24 cursor-pointer appearance-none bg-transparent
        [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
        [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
        [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
        [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line
        [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
        [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0"
    />
  )
}

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

/** 一组「筛选全部选项」的菜单项：下拉被收进「…」时，选项照样选得到 */
function filterGroup(
  title: string,
  current: number | 'all',
  onChange: (value: number | 'all') => void,
  options: FilterOption[],
  allLabel: string,
): ToolbarMenuGroup {
  return {
    label: title,
    items: [
      { label: allLabel, active: current === 'all', onClick: () => onChange('all') },
      ...options
        .filter((option) => option.value !== 'all')
        .map((option) => ({
          label: option.label,
          active: current === option.value,
          onClick: () => onChange(option.value),
        })),
    ],
  }
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
  const entries: OverflowEntry[] = []

  entries.push({
    key: 'range',
    node: (
      <div className="flex shrink-0 items-center gap-2">
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
      </div>
    ),
    menu: [
      {
        label: '看哪些',
        items: [
          { label: '大事表', active: filterMajor, onClick: () => setFilterMajor(true) },
          { label: '全部事件', active: !filterMajor, onClick: () => setFilterMajor(false) },
        ],
      },
    ],
  })

  entries.push({
    key: 'character',
    node: (
      <FilterSelect
        value={characterFilter}
        onChange={onCharacterFilterChange}
        options={characterOptions}
        placeholder="全部角色"
      />
    ),
    menu: [filterGroup('按角色筛选', characterFilter, onCharacterFilterChange, characterOptions, '全部角色')],
  })

  entries.push({
    key: 'country',
    node: (
      <FilterSelect
        value={countryFilter}
        onChange={onCountryFilterChange}
        options={countryOptions}
        placeholder="全部国家"
      />
    ),
    menu: [filterGroup('按国家筛选', countryFilter, onCountryFilterChange, countryOptions, '全部国家')],
  })

  if (showNav || onAddPeriod) {
    const navItems: ToolbarMenuItem[] = []
    if (showNav) {
      navItems.push(
        { label: '上一个事件', icon: <ChevronLeft size={14} strokeWidth={2} />, onClick: onPrev },
        { label: '下一个事件', icon: <ChevronRight size={14} strokeWidth={2} />, onClick: onNext },
      )
    }
    if (onAddPeriod) {
      navItems.push({ label: '添加时期', icon: <Plus size={14} strokeWidth={2} />, onClick: onAddPeriod })
    }
    const navMenu: ToolbarMenuGroup = { label: '画布', items: navItems }
    entries.push({
      key: 'nav',
      node: (
        <div className="flex shrink-0 items-center gap-2">
          <span className={DIVIDER} aria-hidden />
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
            <button onClick={onAddPeriod} className={ICON_BTN_MD} title="添加时期">
              <Plus size={16} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ),
      menu: [navMenu],
    })
  }

  entries.push({
    key: 'display',
    node: (
      <div className="flex shrink-0 items-center gap-2">
        <span className={DIVIDER} aria-hidden />
        <DetailSwitch detail={detail} onChange={onDetailChange} />
        <TrackToggle on={showTracks} onToggle={onToggleTracks} />
      </div>
    ),
    menu: [
      {
        label: '显示',
        items: [
          { label: '简', active: !detail, onClick: () => onDetailChange('simple') },
          { label: '详', active: detail, onClick: () => onDetailChange('detailed') },
          { label: '参与者轨道', active: showTracks, onClick: onToggleTracks },
        ],
      },
    ],
  })

  return (
    <>
      {/* Desktop toolbar：一条栏，窄了自动收进「…」；锁定按钮永远在（trail 不参与收口） */}
      <div className="max-md:hidden sticky top-0 z-10 flex h-12 items-center border-b border-line px-6 bg-paper/85 backdrop-blur-lg">
        <OverflowBar
          lead={<h2 className={`${PAGE_TITLE} mr-1 shrink-0`}>时间线</h2>}
          entries={entries}
          trail={
            <div className="flex items-center gap-2">
              {showZoom ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-ink-faint">百年</span>
                  <ZoomSlider zoomRatio={zoomRatio} onChange={onZoomChange} onCommit={onZoomCommit} />
                  <span className="text-[11px] text-ink-faint">年</span>
                </div>
              ) : null}
              {onExport ? (
                <button onClick={onExport}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                  title="导出图片…"
                  aria-label="导出图片"
                >
                  <ImageDown size={16} strokeWidth={2} />
                </button>
              ) : null}
              <button onClick={onToggleEdit}
                className={`flex h-8 w-8 items-center justify-center transition-colors hover:bg-[var(--oc-hover)] ${editMode ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                title={editMode ? '锁定时间轴' : '解锁时间轴'}
                aria-pressed={editMode}
              >
                {editMode ? <LockOpen size={16} strokeWidth={2} /> : <Lock size={16} strokeWidth={2} />}
              </button>
            </div>
          }
          gap={8}
          className="h-full w-full"
          moreTitle="更多"
        />
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
