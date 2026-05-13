'use client'

import { useState, useMemo } from 'react'
import { X, Search, Images as ImagesIcon, RefreshCw } from 'lucide-react'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'
import { FullscreenViewer } from './FullscreenViewer'
import { useAlbumData, type AlbumEntry } from './useAlbumData'

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'avatar', label: '角色头像' },
  { key: 'portrait', label: '立绘' },
  { key: 'qAvatar', label: 'Q版头像' },
  { key: 'event', label: '事件' },
  { key: 'country', label: '国家' },
]

interface GlobalAlbumProps {
  onClose: () => void
  onNavigate?: (id: number, type: string) => void
}

export function GlobalAlbum({ onClose, onNavigate }: GlobalAlbumProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { entries, loading, refresh } = useAlbumData()

  function handleRefresh() {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }

  const filtered = useMemo(() => {
    let result = entries
    if (category !== 'all') {
      result = result.filter((e) => e.category === category)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((e) => e.sourceName.toLowerCase().includes(q))
    }
    return result
  }, [entries, category, search])

  const allUrls = useMemo(() => filtered.map((e) => e.url), [filtered])

  function getEntryImageUrl(entry: AlbumEntry): string {
    const typeMap: Record<string, string> = {
      avatar: 'avatar',
      qAvatar: 'avatar',
      portrait: 'avatar',
      event: 'avatar',
      country: 'flag',
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
        <div className="flex items-center justify-between border-b border-line px-5 py-3 bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <ImagesIcon size={18} strokeWidth={2} className="text-ink" />
            <h2 className="text-base font-medium text-ink">全局相册</h2>
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
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar categories */}
          <div className="w-[180px] shrink-0 border-r border-line p-3">
            <nav className="flex flex-col gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    category === cat.key
                      ? 'bg-paper-card text-ink'
                      : 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Pure CSS grid */}
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
              <>
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
              </>
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
