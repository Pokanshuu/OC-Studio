'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Users, Calendar, Flag, BookOpen, X } from 'lucide-react'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useKeyboard } from '@/lib/KeyboardContext'
import type { ReferableEntity } from '@/lib/reference-registry'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'

const TYPE_ICON_MAP: Record<string, typeof Users> = {
  character: Users,
  event: Calendar,
  country: Flag,
  world: BookOpen,
}

const TYPE_LABEL_MAP: Record<string, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

interface GroupedResults {
  type: string
  label: string
  items: ReferableEntity[]
}

export function MobileSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigateToEntity } = useEntityNavigate()
  const { height: keyboardHeight } = useKeyboard()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupedResults[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount (autoFocus alone is unreliable in portals)
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      void (async () => {
        if (!query.trim()) {
          setResults([])
          return
        }
        const entities = await searchAllEntitiesFlat(query)
        const groups: Record<string, ReferableEntity[]> = {}
        for (const e of entities) {
          if (!groups[e.type]) groups[e.type] = []
          if (groups[e.type].length < 8) groups[e.type].push(e)
        }
        const grouped: GroupedResults[] = []
        for (const type of ['character', 'event', 'country', 'world']) {
          if (groups[type] && groups[type].length > 0) {
            grouped.push({ type, label: TYPE_LABEL_MAP[type] ?? type, items: groups[type] })
          }
        }
        setResults(grouped)
      })()
    }, 200)
    return () => clearTimeout(timer)
  }, [query, open])

  const handleSelect = useCallback((entity: ReferableEntity) => {
    const numId = Number(entity.id)
    if (Number.isNaN(numId)) return
    navigateToEntity(numId, entity.type)
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
        <div className="absolute inset-0 bg-black/15 dark:bg-black/40" />
        <div
          className="relative flex-1 overflow-auto px-4 pt-[calc(60px+var(--safe-top)+12px)]"
          style={{ paddingBottom: `${inputBarHeight + keyboardHeight}px` }}
        >
          <div className="mx-auto w-full max-w-lg">
            {results.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-ink-faint">
                {query.trim() ? '无匹配结果' : ''}
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((group) => (
                  <div key={group.type} className="bg-paper-card dark:bg-[#2D2B28] border border-line rounded-md overflow-hidden">
                    <div className="px-3 py-1.5 text-xs font-medium text-ink-faint border-b border-line">
                      {group.label}
                    </div>
                    <div>
                      {group.items.map((entity) => {
                        const Icon = TYPE_ICON_MAP[entity.type] ?? Search
                        return (
                          <button
                            key={entity.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelect(entity)
                            }}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-black/8 dark:active:bg-white/8 transition-colors text-ink"
                          >
                            {entity.type === 'character' ? (
                              <Avatar src={getImageUrl(entity.avatarUrl, 'avatar')} size="sm" />
                            ) : entity.type === 'country' ? (
                              <Avatar src={getImageUrl(entity.avatarUrl, 'flag')} size="sm" type="flag" />
                            ) : (
                              <Icon size={20} strokeWidth={2} className="shrink-0 text-ink-faint" />
                            )}
                            <span className="truncate text-sm">{entity.name}</span>
                          </button>
                        )
                      })}
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
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Search size={20} strokeWidth={2} className="shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索角色、事件、国家、词条..."
          className="flex-1 bg-transparent text-ink placeholder:text-ink-faint text-base outline-none"
          autoFocus
          enterKeyHint="search"
        />
        <button
          onClick={() => setQuery('')}
          className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 text-ink-faint ${query ? '' : 'invisible'}`}
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
