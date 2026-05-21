'use client'

import { useState, useMemo, useCallback } from 'react'
import { X, Search, RefreshCw, ChevronRight } from 'lucide-react'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import { FullscreenViewer } from './FullscreenViewer'
import { useAlbumData, type AlbumEntry } from './useAlbumData'

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
  onClose: () => void
  onNavigate?: (id: number, type: string) => void
}

export function GlobalAlbum({ onClose, onNavigate }: GlobalAlbumProps) {
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set<string>())
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { entries, loading, refresh } = useAlbumData()

  function handleRefresh() {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
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

  function getEntryImageUrl(entry: AlbumEntry): string {
    const typeMap: Record<string, string> = {
      avatar: 'avatar',
      qAvatar: 'avatar',
      fullbody: 'avatar',
      header: 'avatar',
      gallery: 'avatar',
      flag: 'flag',
    }
    const url = resolveImageUrl(entry.url)
    if (url.includes('/defaults/')) return url
    return url || getDefaultImage(typeMap[entry.category] || 'avatar')
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[80vh] w-[80vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-paper ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center border-b border-line px-5 py-3 bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-base text-ink">所有相册</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..."
                className="h-8 w-48 rounded border border-line bg-paper-card/60 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none focus:bg-paper-card/80"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${refreshing ? 'animate-spin' : ''}`}
              title="刷新"
            >
              <RefreshCw size={16} strokeWidth={2} />
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-black/5 dark:hover:bg-white/5"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — two-level collapsible categories */}
          <div className="w-[140px] shrink-0 border-r border-line p-3">
            <nav className="flex flex-col gap-1">
              {/* All */}
              <button
                onClick={() => setSelectedKey('all')}
                className={`flex w-full items-center rounded px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedKey === 'all'
                    ? 'bg-paper-card text-ink'
                    : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex-1">全部</span>
                {entries.length > 0 ? (
                  <span className="text-xs text-ink-faint">{entries.length}</span>
                ) : null}
              </button>

              {CATEGORY_TREE.map((top) => {
                const topCount = getTopCount(entries, top)
                const isExpanded = expanded.has(top.key)
                const isTopSelected = selectedKey === top.key
                return (
                  <div key={top.key}>
                    <button
                      onClick={() => {
                        toggleExpand(top.key)
                        setSelectedKey(top.key)
                      }}
                      className={`flex w-full items-center gap-1 rounded px-3 py-1.5 text-left text-sm transition-colors ${
                        isTopSelected
                          ? 'bg-paper-card text-ink'
                          : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className={`shrink-0 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <span className="flex-1">{top.label}</span>
                      {topCount > 0 ? (
                        <span className="text-xs text-ink-faint">{topCount}</span>
                      ) : null}
                    </button>

                    {isExpanded ? (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {top.children.map((sub) => {
                          const subCount = getSubCount(entries, sub)
                          const isSubSelected = selectedKey === sub.key
                          return (
                            <button
                              key={sub.key}
                              onClick={() => setSelectedKey(sub.key)}
                              className={`flex w-full items-center rounded pl-7 pr-3 py-1 text-left text-xs transition-colors ${
                                isSubSelected
                                  ? 'bg-paper-card text-ink'
                                  : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                            >
                              <span className="flex-1">{sub.label}</span>
                              {subCount > 0 ? (
                                <span className="text-[10px] text-ink-faint">{subCount}</span>
                              ) : null}
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

          {/* Grid */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-ink-muted">加载中...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-ink-faint">暂无图片</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {filtered.map((entry, idx) => (
                  <div key={idx} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getEntryImageUrl(entry)}
                      alt={entry.sourceName}
                      className="aspect-square w-full cursor-pointer rounded-md border border-line object-cover transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                      onClick={() => setViewerIndex(idx)}
                    />
                    <div className="mt-1 truncate text-xs text-ink-faint">
                      {entry.sourceName}
                      {onNavigate ? (
                        <button
                          onClick={() => onNavigate(entry.sourceId, entry.sourceType)}
                          className="ml-1 text-ink-muted hover:text-ink"
                        >
                          跳转
                        </button>
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
        <FullscreenViewer
          images={allUrls}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  )
}
