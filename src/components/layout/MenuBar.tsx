'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Search, Users, Calendar, Flag, BookOpen, Minus, Maximize2, Minimize2, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

let appWindow: ReturnType<typeof getCurrentWindow> | null = null
try { appWindow = getCurrentWindow() } catch { /* 非 Tauri 环境 */ }
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { useSettings } from '@/lib/settings'
import type { Settings } from '@/lib/settings'
import { useImportExport } from '@/components/shared/ImportExportUI'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import type { ReferableEntity } from '@/lib/reference-registry'

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

function handleUndo() {
  try { document.execCommand('undo') } catch { /* noop */ }
}

function handleRedo() {
  try { document.execCommand('redo') } catch { /* noop */ }
}

function handleCut() {
  try { document.execCommand('cut') } catch { /* noop */ }
}

function handleCopy() {
  try { document.execCommand('copy') } catch { /* noop */ }
}

function handlePaste() {
  try { document.execCommand('paste') } catch { /* noop */ }
}

function handleSelectAll() {
  try { document.execCommand('selectAll') } catch { /* noop */ }
}

export function MenuBar() {
  const { navigateToEntity } = useEntityNavigate()
  const { settings, updateSetting } = useSettings()
  const { openSettings } = useSettingsTrigger()
  const { handleExport, handleImportClick, dialog: importExportDialog } = useImportExport()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupedResults[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!appWindow) return
    let unlisten: (() => void) | undefined

    appWindow.isMaximized().then(setIsMaximized).catch(() => {})
    appWindow.onResized(async () => {
      const maximized = await appWindow!.isMaximized()
      setIsMaximized(maximized)
    }).then((fn) => { unlisten = fn }).catch(() => {})

    return () => { unlisten?.() }
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    console.log('[MenuBar] Tauri 环境检测:', {
      hasTAURI: typeof window !== 'undefined' && '__TAURI__' in window,
      appWindow: typeof window !== 'undefined' && '__TAURI__' in window,
    })
  }, [])

  const cycleTheme = useCallback(() => {
    const order: Array<Settings["theme"]> = ["light", "dark", "auto"]
    const currentIdx = order.indexOf(settings.theme === "auto" ? "auto" : settings.theme)
    const next = order[(currentIdx + 1) % order.length]
    updateSetting("theme", next)
  }, [settings.theme, updateSetting])

  return (
    <>
    <nav
      data-tauri-drag-region
      className="relative z-40 flex h-10 shrink-0 items-center justify-between border-b border-line bg-paper-alt px-4"
    >
      <div className="flex items-center gap-4">
        <span className="font-serif text-sm text-ink">OC Studio</span>
        <div className="hidden sm:flex sm:items-center sm:gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger>文件</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleImportClick}>
                导入...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>导出为</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={handleExport}>
                    JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled onClick={() => {}}>
                    Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled onClick={() => {}}>
                    TXT
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>发布为</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem disabled onClick={() => {}}>
                    图片
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled onClick={() => {}}>
                    静态网站
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger>编辑</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleUndo}>
                撤销
                <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRedo}>
                重做
                <DropdownMenuShortcut>Ctrl+Shift+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCut}>
                剪切
                <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy}>
                复制
                <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePaste}>
                粘贴
                <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSelectAll}>
                全选
                <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger>视图</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => updateSetting("editMode", !settings.editMode)}>
                {settings.editMode ? "浏览模式" : "编辑模式"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateSetting("sidebarVisible", !settings.sidebarVisible)}>
                {settings.sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={cycleTheme}>
                {settings.theme === "dark" ? "浅色模式" : settings.theme === "light" ? "深色模式" : "跟随系统"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger>关于</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => openSettings("about")}>
                关于软件
              </DropdownMenuItem>
              <DropdownMenuItem disabled onClick={() => {}}>
                检查更新...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="relative">
          <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setSelectedIndex(0) }}
            onFocus={() => { if (results.length > 0) setIsOpen(true) }}
            onBlur={() => { setTimeout(() => setIsOpen(false), 150) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索..."
            className="h-8 w-40 rounded border border-line bg-paper-card pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none sm:w-56 lg:w-64 xl:w-96"
          />

          {isOpen ? (
            <div
              ref={panelRef}
              className="absolute left-0 top-[calc(100%+4px)] z-50 w-full rounded-md border border-line bg-paper/90 backdrop-blur-sm shadow-none ring-1 ring-black/5 max-h-[320px] overflow-auto"
            >
              {results.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-ink-faint">
                  {query.trim() ? '无匹配结果' : '开始输入搜索...'}
                </div>
              ) : (
                results.map((group) => {
                  const groupStartIndex = results
                    .slice(0, results.indexOf(group))
                    .reduce((sum, g) => sum + g.items.length, 0)
                  return (
                    <div key={group.type}>
                      <div className="px-3 py-1 text-xs font-medium text-ink-faint">
                        {group.label}
                      </div>
                      {group.items.map((entity, idx) => {
                        const globalIdx = groupStartIndex + idx
                        const Icon = TYPE_ICON_MAP[entity.type] ?? Search
                        return (
                          <button
                            key={entity.id}
                            data-selected={globalIdx === selectedIndex}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                              globalIdx === selectedIndex
                                ? 'bg-paper-card text-ink'
                                : 'text-ink-muted hover:bg-paper-card hover:text-ink'
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelect(entity)}
                          >
                            <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                            <span className="truncate">{entity.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-0">
        <button
          className="h-7 w-7 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-paper-card transition-colors"
          onClick={() => { appWindow?.minimize() }}
          aria-label="最小化"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <button
          className="h-7 w-7 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-paper-card transition-colors"
          onClick={() => { appWindow?.toggleMaximize() }}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
        </button>
        <button
          className="h-7 w-7 flex items-center justify-center rounded text-ink-muted hover:text-error hover:bg-red-50/50 transition-colors"
          onClick={() => { appWindow?.close() }}
          aria-label="关闭"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </nav>
      {importExportDialog}
    </>
  )
}
