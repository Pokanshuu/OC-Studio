'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, RefreshCw, ChevronRight, ChevronLeft, Menu } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import { FullscreenViewer } from './FullscreenViewer'
import { useAlbumData, type AlbumEntry } from './useAlbumData'
import { useDevice } from '@/lib/use-device'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

interface SubCategory {
  key: string
  label: string
  sourceType: string
  category: string
}

interface TopCategory {
  key: string
  label: string
  children: SubCategory[]
}

const CATEGORY_TREE: TopCategory[] = [
  {
    key: 'character', label: '角色',
    children: [
      { key: 'character:avatar', label: '头像', sourceType: 'character', category: 'avatar' },
      { key: 'character:qAvatar', label: 'Q版头像', sourceType: 'character', category: 'qAvatar' },
      { key: 'character:fullbody', label: '立绘', sourceType: 'character', category: 'fullbody' },
      { key: 'character:header', label: '头图', sourceType: 'character', category: 'header' },
      { key: 'character:gallery', label: '相册图片', sourceType: 'character', category: 'gallery' },
    ],
  },
  {
    key: 'event', label: '事件',
    children: [
      { key: 'event:header', label: '头图', sourceType: 'event', category: 'header' },
      { key: 'event:gallery', label: '图片', sourceType: 'event', category: 'gallery' },
    ],
  },
  {
    key: 'country', label: '国家',
    children: [
      { key: 'country:flag', label: '标志', sourceType: 'country', category: 'flag' },
      { key: 'country:header', label: '头图', sourceType: 'country', category: 'header' },
    ],
  },
]

function getTopCount(entries: AlbumEntry[], top: TopCategory): number {
  return entries.filter((e) =>
    top.children.some((sub) => sub.sourceType === e.sourceType && sub.category === e.category)
  ).length
}

function getSubCount(entries: AlbumEntry[], sub: SubCategory): number {
  return entries.filter((e) => e.sourceType === sub.sourceType && e.category === sub.category).length
}

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
  const [showMobileTree, setShowMobileTree] = useState(false)
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
    return result
  }, [entries, selectedKey, search])

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

  function getEntryImageUrl(entry: AlbumEntry): string {
    const typeMap: Record<string, string> = {
      avatar: 'avatar', qAvatar: 'avatar', fullbody: 'avatar',
      header: 'avatar', gallery: 'avatar', flag: 'flag',
    }
    const url = resolveImageUrl(entry.url)
    if (url.includes('/defaults/')) return url
    return url || getDefaultImage(typeMap[entry.category] || 'avatar')
  }

  const treePanel = (
    <div className="flex h-full flex-col border-r border-line bg-paper-alt">
      {isMobile ? (
        <div className="flex items-center justify-between border-b border-line px-3 py-3">
          <button onClick={() => setShowMobileTree(false)} className="flex h-9 w-9 items-center justify-center rounded text-ink-muted">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${refreshing ? 'animate-spin' : ''}`}
            title="刷新"
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-line px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTreeCollapsed(true)}
              className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink"
              title="折叠目录"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <h2 className="text-lg text-ink font-serif font-bold">相册</h2>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => { setSelectedKey('all'); if (isMobile) setShowMobileTree(false) }}
            className={`flex w-full items-center rounded px-3 py-1.5 text-left text-sm transition-colors ${
              selectedKey === 'all' ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <span className="flex-1">全部</span>
            {entries.length > 0 ? <span className="text-xs text-ink-faint">{entries.length}</span> : null}
          </button>
          {CATEGORY_TREE.map((top) => {
            const topCount = getTopCount(entries, top)
            const isExpanded = expanded.has(top.key)
            const isTopSelected = selectedKey === top.key
            return (
              <div key={top.key}>
                <button
                  onClick={() => { toggleExpand(top.key); setSelectedKey(top.key) }}
                  className={`flex w-full items-center gap-1 rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    isTopSelected ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <ChevronRight size={14} strokeWidth={2} className={`shrink-0 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className="flex-1">{top.label}</span>
                  {topCount > 0 ? <span className="text-xs text-ink-faint">{topCount}</span> : null}
                </button>
                {isExpanded ? (
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {top.children.map((sub) => {
                      const subCount = getSubCount(entries, sub)
                      const isSubSelected = selectedKey === sub.key
                      return (
                        <button key={sub.key}
                          onClick={() => { setSelectedKey(sub.key); if (isMobile) setShowMobileTree(false) }}
                          className={`flex w-full items-center rounded pl-7 pr-3 py-1 text-left text-xs transition-colors ${
                            isSubSelected ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
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

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      {!treeCollapsed && !isMobile ? (
        <div className="w-[200px] shrink-0 overflow-auto">{treePanel}</div>
      ) : null}

      {/* Mobile overlay */}
      {showMobileTree && isMobile ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowMobileTree(false)} />
          <div className="absolute top-[var(--safe-top)] bottom-0 left-0 w-[280px]">{treePanel}</div>
        </div>
      ) : null}

      {/* Right column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Grid — scroll container, header inside for blur */}
        <div className="flex-1 overflow-auto">
          {/* Desktop header */}
          <div className="max-md:hidden sticky top-0 z-10 border-b border-line px-4 py-3 min-h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
            <div className="flex items-center gap-3">
              {treeCollapsed ? (
                <>
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink"
                    title="展开目录"
                  >
                    <Menu size={16} strokeWidth={2} />
                  </button>
                  <h2 className="text-lg text-ink font-serif font-bold">{selectedLabel}</h2>
                  <Separator orientation="vertical" className="h-4 !self-center" />
                </>
              ) : null}
              <div className="relative">
                <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索..."
                  className="h-9 w-48 rounded border border-line bg-paper-card/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
                />
              </div>
              <Separator orientation="vertical" className="h-4 !self-center" />
              <button onClick={handleRefresh} disabled={refreshing}
                className={`flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${refreshing ? 'animate-spin' : ''}`}
                title="刷新"
              >
                <RefreshCw size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Grid content */}
          <div className="flex flex-1 flex-col p-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center"><span className="text-sm text-ink-muted">加载中...</span></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center"><span className="text-sm text-ink-faint">暂无图片</span></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((entry, idx) => (
                <div key={idx} className="group relative">
                  <img
                    src={getEntryImageUrl(entry)} alt={entry.sourceName}
                    className="aspect-square w-full cursor-pointer rounded-md border border-line object-cover transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                    onClick={() => setViewerIndex(idx)}
                  />
                  <div className="mt-1 truncate text-xs text-ink-faint">
                    {entry.sourceName}
                    {onNavigate ? (
                      <button onClick={() => onNavigate(entry.sourceId, entry.sourceType)} className="ml-1 text-ink-muted hover:text-ink">跳转</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {viewerIndex !== null ? (
        <FullscreenViewer images={allUrls} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      ) : null}
    </div>
  )
}
