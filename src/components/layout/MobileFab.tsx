'use client'

import { LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '@/components/shared/SortViewControls'

interface MobileFabProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function MobileFab({ viewMode, onViewModeChange }: MobileFabProps) {
  return (
    <div className="md:hidden fixed bottom-[calc(5rem+var(--safe-bottom))] right-4 z-40 flex flex-col gap-1 rounded-full border border-line bg-paper/80 p-1 shadow-sm backdrop-blur-lg">
      {/* Sliding pill indicator */}
      <div
        className={`absolute left-1 w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 transition-[top] duration-300 ease-out ${
          viewMode === 'grid' ? 'top-1' : 'top-12'
        }`}
      />

      <button
        onClick={() => onViewModeChange('grid')}
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          viewMode === 'grid'
            ? 'text-ink'
            : 'text-ink-faint hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
        }`}
        aria-label="卡片视图"
      >
        <LayoutGrid size={18} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          viewMode === 'list'
            ? 'text-ink'
            : 'text-ink-faint hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
        }`}
        aria-label="列表视图"
      >
        <List size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
