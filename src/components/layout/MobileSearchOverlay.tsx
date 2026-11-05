'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { refreshSearchIndex, searchGlobal, type GlobalSearchGroup, type GlobalSearchHit } from '@/lib/search'
import { searchTerms } from '@/lib/search/matcher'
import { SearchHitRow } from '@/components/shared/search/SearchHitRow'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useKeyboard } from '@/lib/KeyboardContext'
import { useInputContextMenu } from '@/lib/use-input-context-menu'

export function MobileSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigateToEntity } = useEntityNavigate()
  const { viewportHeight: keyboardHeight } = useKeyboard()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([])
  const [searching, setSearching] = useState(false)
  const inputMenuRef = useInputContextMenu()
  const inputElRef = useRef<HTMLInputElement | null>(null)
  const inputRef = useCallback((el: HTMLInputElement | null) => {
    inputMenuRef(el)
    inputElRef.current = el
  }, [inputMenuRef])

  const terms = useMemo(() => searchTerms(query), [query])

  // Focus input on mount (autoFocus alone is unreliable in portals)
  useEffect(() => {
    setTimeout(() => inputElRef.current?.focus(), 100)
  }, [])

  /** 打开面板时强制刷新索引：刚改过的正文也要立刻搜得到 */
  useEffect(() => {
    if (open) void refreshSearchIndex().catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setGroups([])
        setSearching(false)
        return
      }
      setSearching(true)
      void searchGlobal(query)
        .then((found) => {
          if (cancelled) return
          setGroups(found)
          setSearching(false)
        })
        .catch(() => {
          if (cancelled) return
          setGroups([])
          setSearching(false)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  const handleSelect = useCallback((hit: GlobalSearchHit) => {
    navigateToEntity(hit.id, hit.kind)
    onClose()
  }, [navigateToEntity, onClose])

  if (!open) return null

  const inputBarHeight = 56

  return createPortal(
    <>
      {/* Backdrop + results (fixed, fullscreen) */}
      <div
        className="fixed inset-0 z-40 flex flex-col pointer-events-auto"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-[var(--oc-scrim)]" />
        <div
          className="relative flex-1 overflow-auto px-4 pt-[calc(60px+var(--safe-top)+12px)]"
          style={{ paddingBottom: `${inputBarHeight + keyboardHeight}px` }}
        >
          <div className="mx-auto w-full max-w-lg">
            {groups.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-ink-faint">
                {searching ? '搜索中…' : query.trim() ? '无匹配结果' : ''}
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.kind} className="overflow-hidden rounded-item border border-line bg-paper-card">
                    <div className="border-b border-line px-3 py-1 text-xs font-medium text-ink-faint">
                      {group.label} · {group.total > group.hits.length ? `${group.hits.length}+` : group.total}
                    </div>
                    <div>
                      {group.hits.map((hit) => (
                        <SearchHitRow
                          key={`${hit.kind}:${hit.id}`}
                          hit={hit}
                          terms={terms}
                          variant="touch"
                          onSelect={() => handleSelect(hit)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input bar — separate fixed element, always above keyboard */}
      <div
        className="fixed left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-paper/85 backdrop-blur-lg border-t border-line pointer-events-auto"
        style={{
          bottom: `${keyboardHeight}px`,
          paddingBottom: 'calc(12px + var(--safe-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Search size={20} strokeWidth={2} className="shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标题、正文…"
          className="flex-1 bg-transparent text-ink placeholder:text-ink-faint text-base outline-none"
          autoFocus
          enterKeyHint="search"
        />
        <button
          onClick={() => setQuery('')}
          className={`flex h-8 w-8 shrink-0 items-center justify-center text-ink-faint hover:bg-[var(--oc-hover)] ${query ? '' : 'invisible'}`}
          aria-label="清除"
          tabIndex={query ? 0 : -1}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>
    </>,
    document.getElementById('overlay-root')!,
  )
}
