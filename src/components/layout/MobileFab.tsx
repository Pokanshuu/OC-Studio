'use client'

import { GalleryHorizontalEnd, LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '@/components/shared/SortViewControls'

interface MobileFabProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

/** 移动端视图切换：卡片 / 画廊 / 列表（列表模式下才露出文件夹条） */
const MODES: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: 'grid', label: '卡片视图', Icon: LayoutGrid },
  { mode: 'gallery', label: '画廊视图', Icon: GalleryHorizontalEnd },
  { mode: 'list', label: '列表视图', Icon: List },
]

export function MobileFab({ viewMode, onViewModeChange }: MobileFabProps) {
  const activeIndex = Math.max(0, MODES.findIndex((item) => item.mode === viewMode))
  return (
    <div className="md:hidden fixed bottom-[calc(5rem+var(--safe-bottom))] right-4 z-40 flex flex-col gap-1 rounded-panel border border-line bg-paper/85 p-1 backdrop-blur-lg float-shadow">
      {/* Sliding pill indicator —— 外层容器 8px、内层按钮 4px：同心圆角（内层 = 外层 - padding） */}
      <div
        className="absolute left-1 h-10 w-10 rounded-item bg-[var(--oc-hover)] transition-transform duration-slow ease-quiet"
        style={{ transform: `translateY(${activeIndex * 44}px)` }}
      />

      {MODES.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-item transition-colors ${
            viewMode === mode
              ? 'text-ink'
              : 'text-ink-faint hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]'
          }`}
          aria-label={label}
        >
          <Icon size={18} strokeWidth={2} />
        </button>
      ))}
    </div>
  )
}
