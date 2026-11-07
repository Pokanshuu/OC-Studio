'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Users, Calendar, Flag, type LucideIcon } from 'lucide-react'
import { refreshSearchIndex, searchGlobal, type GlobalSearchGroup, type GlobalSearchHit } from '@/lib/search'
import { searchTerms } from '@/lib/search/matcher'
import { SearchHitRow } from '@/components/shared/search/SearchHitRow'
import { useEntityNavigate } from './EntityNavigateContext'
import { useNavigation } from './NavigationContext'
import { useCategories } from '@/lib/categories/store'
import { categoryItemName } from '@/lib/categories/types'
import { categoryIconOf } from '@/lib/categories/icons'
import { sectionCommands, toolIcon } from '@/lib/nav-sections'
import { toolItem } from '@/lib/entry-kinds'
import { isPluginEnabled, isSidebarTool, usePlugins } from '@/lib/plugins'
import { MENU, MENU_GROUP_LABEL, MENU_ITEM_BASE } from '@/lib/ui-tokens'

const CREATE_COMMANDS: { label: string; type: 'character' | 'event' | 'country'; icon: LucideIcon }[] = [
  { label: '新建角色', type: 'character', icon: Users },
  { label: '新建事件', type: 'event', icon: Calendar },
  { label: '新建国家', type: 'country', icon: Flag },
]

interface CommandItem {
  label: string
  /** 点击后 `setActiveItem` 的值（板块 = 标签本身；工具插件 = `tool:<id>`） */
  value: string
  Icon: LucideIcon
  group: string
}

/**
 * 顶栏搜索（Ctrl/Cmd+K 聚焦）：标题 / 别名 / 字段 / **正文** 全文检索 + 快速新建 / 切换板块。
 * 搜索内核与移动端共用 `lib/search`；两套壳只是版式不同。
 */
export function MenuBarSearch() {
  const { navigateToEntity } = useEntityNavigate()
  const { setActiveItem } = useNavigation()
  const categories = useCategories()
  const { plugins } = usePlugins()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([])
  const [searching, setSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const terms = useMemo(() => searchTerms(query), [query])

  /**
   * 空白态与输入时都用的「板块 / 工具」命令表。
   * 板块清单来自 `lib/nav-sections.ts`（与侧栏同一份），工具插件来自插件表 ——
   * 面板不再自己维护一张会过期的列表。
   */
  const sectionItems = useMemo<CommandItem[]>(() => {
    const sections: CommandItem[] = sectionCommands().map((item) => ({
      label: item.label,
      value: item.label,
      Icon: item.icon,
      group: '切换板块',
    }))
    const tools: CommandItem[] = plugins
      .filter((plugin) => isSidebarTool(plugin) && isPluginEnabled(plugin))
      .map((plugin) => ({
        label: plugin.name,
        value: toolItem(plugin.id),
        Icon: toolIcon(plugin.id),
        group: '工具',
      }))
    return [...sections, ...tools]
  }, [plugins])

  /** 输入时也把板块 / 分类命令带出来：搜「宠物」不该只有实体，还得能直接切过去 */
  const sectionMatches = useMemo<CommandItem[]>(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return []
    const matched = sectionItems.filter((cmd) => cmd.label.toLowerCase().includes(needle))
    const used = new Set(matched.map((item) => item.label))
    const categoryMatches: CommandItem[] = categories
      .filter((category) => category.enabled && category.name.toLowerCase().includes(needle))
      .filter((category) => !used.has(category.name))
      .map((category) => ({
        label: category.name,
        value: categoryItemName(category.id),
        Icon: categoryIconOf(category.icon),
        group: '自定义分类',
      }))
    return [...matched, ...categoryMatches]
  }, [query, categories, sectionItems])

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0, width: 320 })

  // 位置必须和「打开」在同一次更新里算好：先按 (0,0) 渲染、再在 effect 里量真实坐标，
  // 面板会先在左上角画一帧再跳回来（下拉「闪现再归位」）。
  const placePanel = useCallback(() => {
    const wrapper = searchWrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    // 结果是两行（标题 + 摘要），面板比输入框宽一点才装得下
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 16)
    const left = Math.min(
      Math.max(8, rect.left - (width - rect.width) / 2),
      window.innerWidth - width - 8,
    )
    setPanelPos({ x: left, y: rect.bottom + 4, width })
  }, [])

  const openPanel = useCallback(() => {
    placePanel()
    setIsOpen(true)
  }, [placePanel])

  /** 每次打开面板强制刷一次索引：刚改过的正文也要立刻搜得到 */
  useEffect(() => {
    if (isOpen) void refreshSearchIndex().catch(() => {})
  }, [isOpen])

  const flatItems = useMemo(() => groups.flatMap((group) => group.hits), [groups])
  const selectedItem = flatItems[selectedIndex] ?? null

  useEffect(() => {
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
          setSelectedIndex(0)
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
  }, [query])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleSelect = useCallback((hit: GlobalSearchHit) => {
    navigateToEntity(hit.id, hit.kind)
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
      closeSearch()
      inputRef.current?.blur()
    }
  }, [flatItems.length, selectedItem, handleSelect, closeSearch])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        openPanel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openPanel])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const activeEl = el.querySelector('[data-selected="true"]') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, groups])

  return (
    <div className="absolute left-1/2 -translate-x-1/2">
      <div className="relative" ref={searchWrapperRef}>
        <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); openPanel(); setSelectedIndex(0) }}
          onFocus={openPanel}
          onBlur={() => { setTimeout(() => setIsOpen(false), 150) }}
          onKeyDown={handleKeyDown}
          placeholder="搜索标题、正文…"
          className="h-6 w-40 border-b border-transparent bg-transparent pl-7 pr-3 text-[12px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none sm:w-56 lg:w-64 xl:w-96"
        />

        {isOpen
          ? createPortal(
              <div
                ref={panelRef}
                className={`fixed max-h-[min(560px,calc(100vh-140px))] overflow-auto pointer-events-auto ${MENU}`}
                style={{
                  left: panelPos.x,
                  top: panelPos.y,
                  width: panelPos.width,
                }}
              >
                {query.trim() === '' ? (
                  <div>
                    <div className={MENU_GROUP_LABEL}>快速新建</div>
                    {CREATE_COMMANDS.map((cmd) => {
                      const Icon = cmd.icon
                      return (
                        <button
                          key={cmd.label}
                          className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleCreateSelect(cmd.type)}
                        >
                          <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                          <span>{cmd.label}</span>
                        </button>
                      )
                    })}
                    {[...new Set(sectionItems.map((item) => item.group))].map((groupName) => (
                      <div key={groupName}>
                        <div className={`mt-1 ${MENU_GROUP_LABEL}`}>{groupName}</div>
                        {sectionItems
                          .filter((item) => item.group === groupName)
                          .map((item) => (
                            <button
                              key={`${groupName}-${item.value}`}
                              className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSectionSelect(item.value)}
                            >
                              <item.Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                              <span>{item.label}</span>
                            </button>
                          ))}
                      </div>
                    ))}
                    {categories.some((category) => category.enabled) ? (
                      <>
                        <div className={`mt-1 ${MENU_GROUP_LABEL}`}>自定义分类</div>
                        {categories
                          .filter((category) => category.enabled)
                          .map((category) => {
                            const Icon = categoryIconOf(category.icon)
                            return (
                              <button
                                key={category.id}
                                className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSectionSelect(categoryItemName(category.id))}
                              >
                                <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                                <span>{category.name}</span>
                              </button>
                            )
                          })}
                      </>
                    ) : null}
                  </div>
                ) : groups.length === 0 && sectionMatches.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-ink-faint">
                    {searching ? '搜索中…' : '无匹配结果'}
                  </div>
                ) : (
                  <>
                    {groups.map((group, groupIndex) => {
                      const groupStartIndex = groups
                        .slice(0, groupIndex)
                        .reduce((sum, item) => sum + item.hits.length, 0)
                      return (
                        <div key={group.kind}>
                          <div className={MENU_GROUP_LABEL}>
                            {group.label} · {group.total > group.hits.length ? `${group.hits.length}+` : group.total}
                          </div>
                          {group.hits.map((hit, index) => {
                            const globalIdx = groupStartIndex + index
                            return (
                              <SearchHitRow
                                key={`${hit.kind}:${hit.id}`}
                                hit={hit}
                                terms={terms}
                                variant="menu"
                                active={globalIdx === selectedIndex}
                                onSelect={() => handleSelect(hit)}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                    {[...new Set(sectionMatches.map((item) => item.group))].map((groupName) => (
                      <div key={groupName}>
                        <div className={MENU_GROUP_LABEL}>{groupName}</div>
                        {sectionMatches
                          .filter((item) => item.group === groupName)
                          .map((item) => (
                            <button
                              key={`${groupName}-${item.label}`}
                              className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSectionSelect(item.value)}
                            >
                              <item.Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          ))}
                      </div>
                    ))}
                  </>
                )}
              </div>,
              document.getElementById('overlay-root')!,
            )
          : null}
      </div>
    </div>
  )
}
