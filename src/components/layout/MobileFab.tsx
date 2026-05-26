'use client'

import { LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '@/components/shared/SortViewControls'

interface MobileFabProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function MobileFab({ viewMode, onViewModeChange }: MobileFabProps) {
  return (
    <div className="md:hidden fixed bottom-[calc(5rem+var(--safe-bottom))] right-4 z-40 flex flex-col gap-1 rounded-full border border-line bg-paper/80 p-1 shadow-sm backdrop-blur-md">
      <button
        onClick={() => onViewModeChange('grid')}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          viewMode === 'grid'
            ? 'bg-black/5 text-ink dark:bg-white/5'
            : 'text-ink-faint'
        }`}
        aria-label="卡片视图"
      >
        <LayoutGrid size={18} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          viewMode === 'list'
            ? 'bg-black/5 text-ink dark:bg-white/5'
            : 'text-ink-faint'
        }`}
        aria-label="列表视图"
      >
        <List size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
