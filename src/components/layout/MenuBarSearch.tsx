'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Users, Calendar, Flag, BookOpen, Clock, GitBranch, Images } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import type { ReferableEntity } from '@/lib/reference-registry'
import { useEntityNavigate } from './EntityNavigateContext'
import { useNavigation } from './NavigationContext'

const TYPE_ICON_MAP: Record<string, typeof Users> = {
  character: Users,
  event: Calendar,
  country: Flag,
  world: BookOpen,
}

interface GroupedResults {
  type: string
  label: string
  items: ReferableEntity[]
}

const TYPE_LABEL_MAP: Record<string, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

const SECTION_COMMANDS: { label: string; icon: typeof Users }[] = [
  { label: '角色', icon: Users },
  { label: '事件', icon: Calendar },
  { label: '国家', icon: Flag },
  { label: '世界观', icon: BookOpen },
  { label: '时间线', icon: Clock },
  { label: '关系图', icon: GitBranch },
  { label: '相册', icon: Images },
]

const CREATE_COMMANDS: { label: string; type: 'character' | 'event' | 'country'; icon: typeof Users }[] = [
  { label: '新建角色', type: 'character', icon: Users },
  { label: '新建事件', type: 'event', icon: Calendar },
  { label: '新建国家', type: 'country', icon: Flag },
]

/**
 * 顶栏搜索（Ctrl/Cmd+K 聚焦）：实体模糊搜索 + 快速新建 / 切换板块。
 * 状态与快捷键都在本组件内；浮层 portal 到 #overlay-root。
 */
export function MenuBarSearch() {
  const { navigateToEntity } = useEntityNavigate()
  const { setActiveItem } = useNavigation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupedResults[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0, width: 256 })

  useEffect(() => {
    if (!isOpen || !searchWrapperRef.current) return

    const rect = searchWrapperRef.current.getBoundingClientRect()
    setPanelPos({ x: rect.left, y: rect.bottom + 4, width: rect.width })
  }, [isOpen])

  const flatItems = useMemo(
    () => results.flatMap((g) => g.items),
    [results],
  )

  const selectedItem = flatItems[selectedIndex] ?? null

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const entities = await searchAllEntitiesFlat(q)
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
    setSelectedIndex(0)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void doSearch(query) }, 200)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const handleSelect = useCallback((entity: ReferableEntity) => {
    const numId = Number(entity.id)
    if (Number.isNaN(numId)) return
    navigateToEntity(numId, entity.type)
    setIsOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }, [navigateToEntity])

  const handleSectionSelect = useCallback((label: string) => {
    setActiveItem(label)
    setIsOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }, [setActiveItem])

  const handleCreateSelect = useCallback((type: 'character' | 'event' | 'country') => {
    window.dispatchEvent(new CustomEvent('oc:create-entity', { detail: { type } }))
    setIsOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedItem) handleSelect(selectedItem)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }, [flatItems, selectedItem, handleSelect])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const activeEl = el.querySelector('[data-selected="true"]') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])
  return (      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="relative" ref={searchWrapperRef}>
          <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setSelectedIndex(0) }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => { setTimeout(() => setIsOpen(false), 150) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索..."
            className="h-6 w-40 border-b border-transparent bg-transparent pl-7 pr-3 text-[12px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none sm:w-56 lg:w-64 xl:w-96"
          />

          {isOpen
            ? createPortal(
                <div
                  ref={panelRef}
                  className="fixed border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg shadow-none max-h-[320px] overflow-auto pointer-events-auto"
                  style={{
                    left: panelPos.x,
                    top: panelPos.y,
                    width: panelPos.width,
                  }}
                >
              {query.trim() === '' ? (
                <div>
                  <div className="px-3 py-1 text-[11px] tracking-[0.08em] text-ink-faint">快速新建</div>
                  {CREATE_COMMANDS.map((cmd) => {
                    const Icon = cmd.icon
                    return (
                      <button
                        key={cmd.label}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleCreateSelect(cmd.type)}
                      >
                        <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                        <span>{cmd.label}</span>
                      </button>
                    )
                  })}
                  <div className="mt-1 px-3 py-1 text-[11px] tracking-[0.08em] text-ink-faint">切换板块</div>
                  {SECTION_COMMANDS.map((cmd) => {
                    const Icon = cmd.icon
                    return (
                      <button
                        key={cmd.label}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSectionSelect(cmd.label)}
                      >
                        <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                        <span>{cmd.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : results.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-ink-faint">
                  无匹配结果
                </div>
              ) : (
                results.map((group) => {
                  const groupStartIndex = results
                    .slice(0, results.indexOf(group))
                    .reduce((sum, g) => sum + g.items.length, 0)
                  return (
                    <div key={group.type}>
                      <div className="px-3 py-1 text-[11px] tracking-[0.08em] text-ink-faint">
                        {group.label}
                      </div>
                      {group.items.map((entity, idx) => {
                        const globalIdx = groupStartIndex + idx
                        const Icon = TYPE_ICON_MAP[entity.type] ?? Search
                        return (
                          <button
                            key={entity.id}
                            data-selected={globalIdx === selectedIndex}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                              globalIdx === selectedIndex
                                ? 'bg-[var(--oc-hover)] text-ink'
                                : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelect(entity)}
                          >
                            {entity.type === 'character' ? (
                              <Avatar src={getImageUrl(entity.avatarUrl, 'avatar')} size="sm" />
                            ) : entity.type === 'country' ? (
                              <Avatar src={getImageUrl(entity.avatarUrl, 'flag')} size="sm" type="flag" />
                            ) : (
                              <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                            )}
                            <span className="truncate">{entity.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>,
            document.getElementById('overlay-root')!,
          ) : null}
        </div>
      </div>
  )
}



