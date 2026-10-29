'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, RefreshCw, Menu, ExternalLink } from 'lucide-react'
import { ICON_BTN_MD, LOADING_TEXT, PAGE_TITLE } from '@/lib/ui-tokens'
import { FullscreenViewer } from './FullscreenViewer'
import { useAlbumData, type AlbumEntry } from './useAlbumData'
import { useDevice } from '@/lib/use-device'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { useTags } from '@/features/tags'
import { SortSelect } from '@/components/shared/SortViewControls'
import { AlbumCard } from './AlbumCard'
import { FilterSelect } from './FilterSelect'
import { AlbumTreePanel } from './AlbumTreePanel'
import { ListWidthResizer } from '@/components/editor/ListWidthResizer'
import { useListWidth } from '@/components/editor/useListWidth'
import { CATEGORY_TREE } from './album-utils'

interface GlobalAlbumProps {
  onNavigate?: (id: number, type: string) => void
}

export function GlobalAlbum({ onNavigate }: GlobalAlbumProps) {
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set<string>())
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const { width: listWidth, startDrag: startListDrag, reset: resetListWidth } = useListWidth()
  const [showMobileTree, setShowMobileTree] = useState(false)
  const [tagFilter, setTagFilter] = useState<number | 'all'>('all')
  const [sortByTime, setSortByTime] = useState(false)
  const { tags } = useTags()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const { section } = useMobileNavigation()

  // Listen for mobile top bar toggle event
  useEffect(() => {
    const handler = () => setShowMobileTree(true)
    window.addEventListener('albumToggle', handler)
    return () => window.removeEventListener('albumToggle', handler)
  }, [])

  const { entries, loading, refresh } = useAlbumData()

  function handleRefresh() {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  const openActionSheet = useCallback((entry: AlbumEntry) => {
    setActionSheet({
      open: true,
      title: entry.sourceName,
      actions: [
        { id: 'navigate', label: '跳转', icon: <ExternalLink size={20} strokeWidth={2} />, onPress: () => onNavigate?.(entry.sourceId, entry.sourceType) },
      ],
    })
  }, [onNavigate])

  const filtered = useMemo(() => {
    let result = entries
    if (selectedKey !== 'all') {
      const top = CATEGORY_TREE.find((t) => t.key === selectedKey)
      if (top) {
        result = result.filter((e) =>
          top.children.some((sub) => sub.sourceType === e.sourceType && sub.category === e.category)
        )
      } else {
        for (const t of CATEGORY_TREE) {
          const sub = t.children.find((s) => s.key === selectedKey)
          if (sub) {
            result = result.filter((e) => e.sourceType === sub.sourceType && e.category === sub.category)
            break
          }
        }
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((e) =>
        e.sourceName.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      )
    }
    if (tagFilter !== 'all') {
      result = result.filter((e) => e.tags.includes(tagFilter))
    }
    if (sortByTime) {
      result = [...result].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return result
  }, [entries, selectedKey, search, tagFilter, sortByTime])

  const allUrls = useMemo(() => filtered.map((e) => e.url), [filtered])

  const selectedLabel = useMemo(() => {
    if (selectedKey === 'all') return '所有相册'
    for (const top of CATEGORY_TREE) {
      if (top.key === selectedKey) return top.label
      const sub = top.children.find((s) => s.key === selectedKey)
      if (sub) return sub.label
    }
    return '所有相册'
  }, [selectedKey])

  // Set mobile top bar title — only when this section is active
  useEffect(() => {
    if (isMobile && section === 'album') setConfig(selectedLabel)
    else setConfig(null)
  }, [isMobile, section, selectedLabel, setConfig])

  const treePanel = (
    <AlbumTreePanel
      entries={entries}
      selectedKey={selectedKey}
      onSelectKey={setSelectedKey}
      expanded={expanded}
      onToggleExpand={toggleExpand}
      isMobile={isMobile}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      onCloseMobileTree={() => setShowMobileTree(false)}
      onCollapseTree={() => setTreeCollapsed(true)}
    />
  )

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      {!isMobile ? (
        <div
          className="relative shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: treeCollapsed ? 0 : listWidth }}
        >
          {treePanel}
          {!treeCollapsed ? (
            <ListWidthResizer onDragStart={startListDrag} onReset={resetListWidth} />
          ) : null}
        </div>
      ) : null}

      {/* Mobile overlay */}
      {isMobile ? (
        <div className={`fixed inset-0 z-50 transition-all duration-200 ${showMobileTree ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${showMobileTree ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowMobileTree(false)} />
          <div className={`absolute top-0 bottom-0 left-0 w-[280px] transition-transform duration-200 ease-out ${showMobileTree ? 'translate-x-0' : '-translate-x-full'}`}>
            {treePanel}
          </div>
        </div>
      ) : null}

      {/* Right column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-auto max-md:overflow-visible">
        <div className="md:hidden h-[calc(60px+var(--safe-top))] flex-shrink-0" />
        {/* Grid — scroll container, header inside for blur */}
        <div className="flex-1">
          {/* Desktop header */}
          <div className="max-md:hidden sticky top-0 z-10 flex items-center border-b border-line px-4 h-12 bg-paper/85 backdrop-blur-lg">
            <div className="flex items-center gap-3">
              {treeCollapsed ? (
                <>
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className={ICON_BTN_MD}
                    title="展开目录"
                  >
                    <Menu size={16} strokeWidth={2} />
                  </button>
                  <h2 className={PAGE_TITLE}>{selectedLabel}</h2>
                </>
              ) : null}
              <div className="relative">
                <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索..."
                  className="h-8 w-48 border-b border-transparent bg-transparent pl-7 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
                />
              </div>
              <FilterSelect
                value={tagFilter}
                onChange={setTagFilter}
                options={[
                  { value: 'all', label: '全部标签' },
                  ...tags
                    .filter((t) => t.id !== undefined)
                    .map((t) => ({ value: t.id, label: t.name })),
                ]}
                fallbackLabel="全部标签"
                triggerClassName="touch-feedback flex h-8 items-center gap-1 px-2 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
              />
              <SortSelect
                sortKey={sortByTime ? 'time' : 'default'}
                onChange={(key) => setSortByTime(key === 'time')}
                options={[
                  { label: '默认顺序', value: 'default' },
                  { label: '最近更新', value: 'time' },
                ]}
              />
              <button onClick={handleRefresh} disabled={refreshing}
                className={`${ICON_BTN_MD} ${refreshing ? 'animate-spin' : ''}`}
                title="刷新"
              >
                <RefreshCw size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Grid content */}
          <div className="flex flex-1 flex-col px-4 pt-4 pb-24 md:pb-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center"><span className={LOADING_TEXT}>加载中…</span></div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[40vh] flex-1 items-center justify-center"><span className="font-serif text-sm text-ink-faint">暂无图片</span></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((entry, idx) => (
                <AlbumCard
                  key={idx}
                  entry={entry}
                  isMobile={isMobile}
                  onNavigate={onNavigate}
                  onLongPress={onNavigate ? () => openActionSheet(entry) : undefined}
                  onViewImage={() => setViewerIndex(idx)}
                />
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {viewerIndex !== null ? (
        <FullscreenViewer images={allUrls} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      ) : null}

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((prev) => ({ ...prev, open: false }))}
        title={actionSheet.title}
        actions={actionSheet.actions}
      />
    </div>
  )
}




