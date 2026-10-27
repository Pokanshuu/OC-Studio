'use client'

import { LayoutGrid, List } from 'lucide-react'
import type { ViewMode } from '@/components/shared/SortViewControls'

interface MobileFabProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function MobileFab({ viewMode, onViewModeChange }: MobileFabProps) {
  return (
    <div className="md:hidden fixed bottom-[calc(5rem+var(--safe-bottom))] right-4 z-40 flex flex-col gap-1 rounded-media border border-line bg-paper/85 p-1 backdrop-blur-lg">
      {/* Sliding pill indicator */}
      <div
        className={`absolute left-1 h-10 w-10 rounded-item bg-[var(--oc-hover)] transition-[top] duration-300 ease-out ${
          viewMode === 'grid' ? 'top-1' : 'top-12'
        }`}
      />

      <button
        onClick={() => onViewModeChange('grid')}
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-item transition-colors ${
          viewMode === 'grid'
            ? 'text-ink'
            : 'text-ink-faint hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]'
        }`}
        aria-label="卡片视图"
      >
        <LayoutGrid size={18} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-item transition-colors ${
          viewMode === 'list'
            ? 'text-ink'
            : 'text-ink-faint hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]'
        }`}
        aria-label="列表视图"
      >
        <List size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
