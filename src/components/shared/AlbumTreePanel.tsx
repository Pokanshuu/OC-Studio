'use client'

import { ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react'
import { ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'
import type { AlbumEntry } from './useAlbumData'
import { CATEGORY_TREE, getTopCount, getSubCount } from './album-utils'

interface AlbumTreePanelProps {
  entries: AlbumEntry[]
  selectedKey: string
  onSelectKey: (key: string) => void
  expanded: Set<string>
  onToggleExpand: (key: string) => void
  isMobile: boolean
  refreshing: boolean
  onRefresh: () => void
  onCloseMobileTree: () => void
  onCollapseTree: () => void
}

/** 相册分类树（桌面为侧栏，移动端为抽屉内容） */
export function AlbumTreePanel({
  entries,
  selectedKey,
  onSelectKey,
  expanded,
  onToggleExpand,
  isMobile,
  refreshing,
  onRefresh,
  onCloseMobileTree,
  onCollapseTree,
}: AlbumTreePanelProps) {
  return (
    <div className="flex h-full flex-col border-r border-line bg-paper-alt max-md:pt-[var(--safe-top)]">
      {isMobile ? (
        <div className="flex h-12 items-center justify-between border-b border-line px-3">
          <button onClick={onCloseMobileTree} className={ICON_BTN_MD}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button onClick={onRefresh} disabled={refreshing}
            className={`${ICON_BTN_MD} ${refreshing ? 'animate-spin' : ''}`}
            title="刷新"
          >
            <RefreshCw size={15} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="flex h-12 items-center justify-between border-b border-line px-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onCollapseTree}
              className={ICON_BTN_MD}
              title="折叠目录"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <h2 className={PAGE_TITLE}>相册</h2>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => { onSelectKey('all'); if (isMobile) onCloseMobileTree() }}
            className={`flex w-full items-center rounded-item px-2 py-1.5 text-left text-[13px] transition-colors ${
              selectedKey === 'all' ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
            }`}
          >
            <span className="flex-1">全部</span>
            {entries.length > 0 ? <span className="text-[11px] text-ink-faint">{entries.length}</span> : null}
          </button>
          {CATEGORY_TREE.map((top) => {
            const topCount = getTopCount(entries, top)
            const isExpanded = expanded.has(top.key)
            const isTopSelected = selectedKey === top.key
            return (
              <div key={top.key}>
                <button
                  onClick={() => { onToggleExpand(top.key); onSelectKey(top.key) }}
                  className={`flex w-full items-center gap-1 rounded-item px-2 py-1.5 text-left text-[13px] transition-colors ${
                    isTopSelected ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                  }`}
                >
                  <ChevronRight size={13} strokeWidth={2} className={`shrink-0 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className="flex-1">{top.label}</span>
                  {topCount > 0 ? <span className="text-[11px] text-ink-faint">{topCount}</span> : null}
                </button>
                {isExpanded ? (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {top.children.map((sub) => {
                      const subCount = getSubCount(entries, sub)
                      const isSubSelected = selectedKey === sub.key
                      return (
                        <button key={sub.key}
                          onClick={() => { onSelectKey(sub.key); if (isMobile) onCloseMobileTree() }}
                          className={`flex w-full items-center rounded-item py-1 pl-6 pr-2 text-left text-[12px] transition-colors ${
                            isSubSelected ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                          }`}
                        >
                          <span className="flex-1">{sub.label}</span>
                          {subCount > 0 ? <span className="text-[10px] text-ink-faint">{subCount}</span> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
