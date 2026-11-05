'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Download, ExternalLink, Eye, Images, Menu, RefreshCw, Search } from 'lucide-react'
import { ICON_BTN_MD, LOADING_TEXT } from '@/lib/ui-tokens'
import { useScrollShade } from '@/lib/use-scroll-shade'
import { PageToolbar } from './PageToolbar'
import { ListEmptyState } from './ListEmptyState'
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
import { useMediaDownload } from '@/lib/use-media-download'
import { ListWidthResizer } from '@/components/editor/ListWidthResizer'
import { useListWidth } from '@/components/editor/useListWidth'
import { CATEGORY_TREE, albumSourceLabel, albumSourceType, collectAlbumSources, matchesAlbumCategory } from './album-utils'

/** 相册页头里的筛选触发按钮（比 ui-tokens 的 FILTER_TRIGGER 更紧一点） */
const ALBUM_FILTER_TRIGGER = 'touch-feedback flex h-8 items-center gap-1 px-2 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]'

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
  /** 右栏自己滚（相册不是 ListShell）：页头的线 / 模糊跟着它的滚动位置走 */
  const [gridScrollEl, setGridScrollEl] = useState<HTMLDivElement | null>(null)
  const gridScrolled = useScrollShade(gridScrollEl)
  const [tagFilter, setTagFilter] = useState<number | 'all'>('all')
  /** 按来源实体筛选（角色 / 事件 / 国家）；分类变了就复位 */
  const [sourceFilter, setSourceFilter] = useState<number | 'all'>('all')
  const [sortByTime, setSortByTime] = useState(false)
  const { tags } = useTags()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const { section } = useMobileNavigation()
  // 「保存到…」的唯一口：防连点 + 失败 toast 都在 hook 里
  const { save, saving } = useMediaDownload()

  // Listen for mobile top bar toggle event
  useEffect(() => {
    const handler = () => setShowMobileTree(true)
    window.addEventListener('albumToggle', handler)
    return () => window.removeEventListener('albumToggle', handler)
  }, [])

  const { entries, loading, refresh } = useAlbumData()

  // 「按来源筛选」只对具体分类有意义：'全部' 下没有单一实体类型可筛
  const sourceType = useMemo(() => albumSourceType(selectedKey), [selectedKey])
  const sources = useMemo(
    () =>
      sourceType === null
        ? []
        : collectAlbumSources(entries.filter((e) => matchesAlbumCategory(e, selectedKey)), sourceType),
    [entries, selectedKey, sourceType],
  )
  // 选中的实体被删 / 换了分类就退化成「全部」，不用 effect 清理状态
  const activeSourceFilter = sources.some((s) => s.id === sourceFilter) ? sourceFilter : 'all'

  function handleRefresh() {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }

  const handleSelectKey = useCallback((key: string) => {
    setSelectedKey(key)
    setSourceFilter('all')
  }, [])

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  /**
   * 移动端长按动作表。**顺序与桌面右键一致**（查看 → 保存到… → 跳转），
   * 且不挂在 `onNavigate` 是否存在上：没有跳转目标时只是少一项，查看与保存照旧。
   */
  const openActionSheet = useCallback((entry: AlbumEntry, index: number) => {
    setActionSheet({
      open: true,
      title: entry.sourceName,
      actions: [
        {
          id: 'view',
          label: '查看大图',
          icon: <Eye size={20} strokeWidth={2} />,
          onPress: () => setViewerIndex(index),
        },
        {
          id: 'download',
          label: saving ? '保存中…' : '保存到…',
          icon: <Download size={20} strokeWidth={2} />,
          onPress: () => {
            void save(entry.url, entry.sourceName)
          },
        },
        ...(onNavigate === undefined
          ? []
          : [
              {
                id: 'navigate',
                label: '跳转',
                icon: <ExternalLink size={20} strokeWidth={2} />,
                onPress: () => onNavigate(entry.sourceId, entry.sourceType),
              },
            ]),
      ],
    })
  }, [onNavigate, save, saving])

  const filtered = useMemo(() => {
    let result = entries.filter((e) => matchesAlbumCategory(e, selectedKey))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((e) =>
        e.sourceName.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      )
    }
    if (tagFilter !== 'all') {
      result = result.filter((e) => e.tags.includes(tagFilter))
    }
    if (sourceType !== null && activeSourceFilter !== 'all') {
      result = result.filter((e) => e.sourceType === sourceType && e.sourceId === activeSourceFilter)
    }
    if (sortByTime) {
      result = [...result].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return result
  }, [entries, selectedKey, search, tagFilter, sourceType, activeSourceFilter, sortByTime])

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
      onSelectKey={handleSelectKey}
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
      <div ref={setGridScrollEl} className="flex flex-1 flex-col min-w-0 overflow-auto max-md:overflow-visible">
        <div className="md:hidden h-[calc(60px+var(--safe-top))] flex-shrink-0" />
        {/* 页头就挂在这个滚动容器里：上滑后由它自己的底色 + 模糊挡住背后的图 */}
        <div className="flex-1">
          {/* Desktop header */}
          <PageToolbar
            title={selectedLabel}
            scrolled={gridScrolled}
            className="max-md:hidden"
            actions={
              <>
                <div className="relative">
                  <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索..."
                    className="h-8 w-48 border-b border-transparent bg-transparent pl-7 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
                  />
                </div>
                {/* 按来源筛选：只在具体分类下出现（角色 / 事件 / 国家） */}
                {sourceType !== null && sources.length > 0 ? (
                  <FilterSelect
                    value={activeSourceFilter}
                    onChange={setSourceFilter}
                    options={[
                      { value: 'all', label: `全部${albumSourceLabel(sourceType)}` },
                      ...sources.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                    fallbackLabel={`全部${albumSourceLabel(sourceType)}`}
                    labelClassName="max-w-[9rem] truncate"
                    triggerClassName={ALBUM_FILTER_TRIGGER}
                  />
                ) : null}
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
                  triggerClassName={ALBUM_FILTER_TRIGGER}
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
              </>
            }
          >
            {treeCollapsed ? (
              <button
                onClick={() => setTreeCollapsed(false)}
                className={ICON_BTN_MD}
                title="展开目录"
              >
                <Menu size={16} strokeWidth={2} />
              </button>
            ) : null}
          </PageToolbar>

          {/* Grid content */}
          <div className="flex flex-1 flex-col px-4 pt-4 pb-24 md:pb-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center"><span className={LOADING_TEXT}>加载中…</span></div>
          ) : filtered.length === 0 ? (
            <ListEmptyState icon={Images} message="暂无图片" className="min-h-[40vh]" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((entry, idx) => (
                <AlbumCard
                  key={idx}
                  entry={entry}
                  isMobile={isMobile}
                  onNavigate={onNavigate}
                  onLongPress={() => openActionSheet(entry, idx)}
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




