'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, RefreshCw, ChevronRight, ChevronLeft, Menu, ExternalLink, Clock, ChevronDown } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import { FullscreenViewer } from './FullscreenViewer'
import { useAlbumData, type AlbumEntry } from './useAlbumData'
import { useDevice } from '@/lib/use-device'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { useTags } from '@/features/tags'

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

function getEntryImageUrl(entry: AlbumEntry): string {
  const typeMap: Record<string, string> = {
    avatar: 'avatar', qAvatar: 'avatar', fullbody: 'avatar',
    header: 'avatar', gallery: 'avatar', flag: 'flag',
  }
  const url = resolveImageUrl(entry.url)
  if (url.includes('/defaults/')) return url
  return url || getDefaultImage(typeMap[entry.category] || 'avatar')
}

function AlbumCard({
  entry,
  isMobile,
  onNavigate,
  onLongPress,
  onViewImage,
}: {
  entry: AlbumEntry
  isMobile: boolean
  onNavigate?: (id: number, type: string) => void
  onLongPress?: () => void
  onViewImage: () => void
}) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="group relative" {...longPress}>
      <img
        src={getEntryImageUrl(entry)}
        alt={entry.sourceName}
        className="touch-feedback aspect-square w-full cursor-pointer rounded-md border border-line object-cover transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
        onClick={onViewImage}
      />
      <div className="mt-1 truncate text-xs text-ink-faint">
        {entry.sourceName}
        {onNavigate && !isMobile ? (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(entry.sourceId, entry.sourceType) }}
              className="ml-1 text-ink-muted hover:text-ink active:bg-black/8 dark:active:bg-white/8 rounded"
            >
              跳转
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}

interface TagOption {
  value: number | 'all'
  label: string
}

function TagFilterSelect({
  value,
  onChange,
  options,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: TagOption[]
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node
    const overlay = document.getElementById('overlay-root')
    if (triggerRef.current && !triggerRef.current.contains(target)) {
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (overlay && overlay.contains(target)) return
        setOpen(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '全部标签'

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="touch-feedback flex h-9 items-center gap-1 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink transition-colors hover:border-line-hover"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto rounded-md border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
              style={{ left: pos.x, top: pos.y }}
            >
              {options.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                    value === opt.value
                      ? 'bg-black/5 dark:bg-white/5 text-ink'
                      : 'text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.getElementById('overlay-root')!,
          )
        : null}
    </div>
  )
}

export function GlobalAlbum({ onNavigate }: GlobalAlbumProps) {
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set<string>())
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
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
    <div className="flex h-full flex-col border-r border-line bg-paper-alt max-md:pt-[var(--safe-top)]">
      {isMobile ? (
        <div className="flex items-center justify-between border-b border-line px-3 py-3">
          <button onClick={() => setShowMobileTree(false)} className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className={`flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 ${refreshing ? 'animate-spin' : ''}`}
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
              className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8"
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
              selectedKey === 'all' ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
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
                    isTopSelected ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
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
                            isSubSelected ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8'
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
      {!isMobile ? (
        <div className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${treeCollapsed ? 'w-0' : 'w-[200px]'}`}>
          {treePanel}
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
          <div className="max-md:hidden sticky top-0 z-10 border-b border-line px-4 py-3 h-[60px] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
            <div className="flex items-center gap-3">
              {treeCollapsed ? (
                <>
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8"
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
              <TagFilterSelect
                value={tagFilter}
                onChange={setTagFilter}
                options={[
                  { value: 'all', label: '全部标签' },
                  ...tags
                    .filter((t) => t.id !== undefined)
                    .map((t) => ({ value: t.id as number, label: t.name })),
                ]}
              />
              <button
                onClick={() => setSortByTime(!sortByTime)}
                className={`touch-feedback flex h-9 items-center gap-1 rounded border px-3 text-sm transition-colors ${sortByTime ? 'border-line-hover bg-paper-card text-ink' : 'border-line bg-paper-card/60 text-ink-muted hover:border-line-hover hover:text-ink'}`}
              >
                <Clock size={14} strokeWidth={2} />
                <span>最近更新</span>
              </button>
              <Separator orientation="vertical" className="h-4 !self-center" />
              <button onClick={handleRefresh} disabled={refreshing}
                className={`flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 ${refreshing ? 'animate-spin' : ''}`}
                title="刷新"
              >
                <RefreshCw size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Grid content */}
          <div className="flex flex-1 flex-col px-4 pt-4 pb-24 md:pb-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center"><span className="text-sm text-ink-muted">加载中...</span></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center min-h-[40vh]"><span className="text-sm text-ink-faint">暂无图片</span></div>
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
