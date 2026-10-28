'use client'

import { Plus, Menu, ChevronLeft, Search } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'
import type { WorldEntry } from '@/types'
import { WorldTree } from './WorldTree'

interface WorldTreePanelProps {
  entries: WorldEntry[]
  selectedId: number | null
  onSelect: (id: number, entry: WorldEntry) => void
  onCreate: (parentId: number | null, title: string) => void
  onDelete: (id: number) => void
  onRename: (id: number, title: string) => void
  onReorder: (updates: { id: number; parentId: number | null; order: number }[]) => void
  treeQuery: string
  onTreeQueryChange: (value: string) => void
  treeCollapsed: boolean
  onToggleTreeCollapsed: () => void
  isMobile: boolean
  onCloseMobileTree: () => void
}

/** 世界观目录面板（桌面侧栏 / 移动端抽屉共用同一份） */
export function WorldTreePanel({
  entries,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onReorder,
  treeQuery,
  onTreeQueryChange,
  treeCollapsed,
  onToggleTreeCollapsed,
  isMobile,
  onCloseMobileTree,
}: WorldTreePanelProps) {
  return (
    <div className="flex h-full flex-col border-r border-line bg-paper-alt max-md:pt-[var(--safe-top)]">
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          {isMobile ? (
            <button onClick={onCloseMobileTree} className={ICON_BTN_MD}>
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          {!isMobile ? (
            <button
              onClick={onToggleTreeCollapsed}
              className="flex h-8 w-8 items-center justify-center text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
              title={treeCollapsed ? '展开目录' : '折叠目录'}
            >
              {treeCollapsed ? <Menu size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
            </button>
          ) : null}
          <h2 className={PAGE_TITLE}>世界观</h2>
        </div>
        <button
          onClick={() => onCreate(null, '新词条')}
          className={ICON_BTN_MD}
          title="新建词条"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* 目录搜索 */}
      <div className="border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-2 border-b border-transparent transition-colors focus-within:border-line-hover">
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={treeQuery}
            onChange={(e) => onTreeQueryChange(e.target.value)}
            placeholder="搜索词条"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <WorldTree
          entries={entries}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreate={onCreate}
          onDelete={onDelete}
          onRename={onRename}
          onReorder={onReorder}
          isMobile={isMobile}
        />
      </div>
    </div>
  )
}
