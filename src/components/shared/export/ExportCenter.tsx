import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Archive, BookText, FileText, Globe2, Image as ImageIcon, Milestone, Share2 } from 'lucide-react'
import { ICON_BTN, PAGE_TITLE } from '@/lib/ui-tokens'
import { PosterPanel } from './PosterPanel'
import { SitePanel } from './SitePanel'
import { DocumentPanel } from './DocumentPanel'
import { BackupPanel } from './BackupPanel'
import { GraphPanel } from './GraphPanel'
import { TimelinePanel } from './TimelinePanel'
import { NovelPanel } from './NovelPanel'
import type { PosterSubjectKind } from '@/lib/export/poster/subjects'

export type ExportTabId = 'poster' | 'site' | 'document' | 'novel' | 'graph' | 'timeline' | 'backup'

interface TabMeta {
  id: ExportTabId
  label: string
  icon: typeof ImageIcon
}

const TABS: TabMeta[] = [
  { id: 'poster', label: '海报', icon: ImageIcon },
  { id: 'site', label: '网站', icon: Globe2 },
  { id: 'document', label: '文档', icon: FileText },
  { id: 'novel', label: '小说', icon: BookText },
  { id: 'graph', label: '关系图', icon: Share2 },
  { id: 'timeline', label: '时间线', icon: Milestone },
  { id: 'backup', label: '备份', icon: Archive },
]

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ExportCenterProps {
  /** 小说：按小说根笔记 id 打开（面板自己读章节） */
  novelId?: number
  onClose: () => void
  initialTab?: ExportTabId
  /** 从实体编辑器 / 模板编排层打开时，直接落在这一条 */
  initialSubject?: { kind: PosterSubjectKind; id: number }
}

export function ExportCenter({ onClose, initialTab = 'poster', initialSubject, novelId }: ExportCenterProps) {
  const [tab, setTab] = useState<ExportTabId>(initialTab)
  const [visited, setVisited] = useState<Set<ExportTabId>>(new Set([initialTab]))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const tabStripRef = useRef<HTMLDivElement | null>(null)

  // 打开时把焦点收进来，关闭时还给打开它的那个按钮 —— 否则 Tab 会跑到后面的编辑器里
  useEffect(() => {
    const previous = document.activeElement
    const first = rootRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectTab = (next: ExportTabId): void => {
    setTab(next)
    setVisited((current) => {
      if (current.has(next)) return current
      const copy = new Set(current)
      copy.add(next)
      return copy
    })
  }

  /** Tab 只在面板里循环；Shift+Tab 从第一个绕回最后一个。 */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return
    const root = rootRef.current
    if (root === null) return
    const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null,
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
  }

  /** 页签行支持 ← → 切换（和工具栏的页签一样，不用鼠标也能走）。 */
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = TABS.findIndex((item) => item.id === tab)
    let next = index
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = TABS.length - 1
    const target = TABS[next]
    selectTab(target.id)
    tabStripRef.current?.querySelector<HTMLElement>(`[data-tab="${target.id}"]`)?.focus()
  }

  const panels: Record<ExportTabId, ReactNode> = {
    poster: <PosterPanel initialSubject={initialSubject} />,
    site: <SitePanel />,
    document: <DocumentPanel />,
    novel: <NovelPanel novelId={novelId} />,
    graph: <GraphPanel />,
    timeline: <TimelinePanel />,
    backup: <BackupPanel />,
  }

  const content = (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-center-title"
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-paper"
      onKeyDown={onKeyDown}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <button type="button" onClick={onClose} className={`${ICON_BTN} w-auto gap-1 px-1.5`} aria-label="返回">
          <ArrowLeft size={16} strokeWidth={2} />
          <span className="text-[13px] max-md:hidden">返回</span>
        </button>
        <h1 id="export-center-title" className={`${PAGE_TITLE} truncate`}>
          导出中心
        </h1>
      </header>

      <div
        ref={tabStripRef}
        role="tablist"
        aria-label="导出类型"
        onKeyDown={onTabKeyDown}
        className="flex h-10 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line px-3"
      >
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-tab={item.id}
              aria-selected={active}
              aria-controls={`export-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(item.id)}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 text-[13px] transition-colors ${
                active ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon size={14} strokeWidth={2} />
              {item.label}
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-ink" aria-hidden />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        {TABS.map((item) =>
          visited.has(item.id) ? (
            <div
              key={item.id}
              id={`export-panel-${item.id}`}
              role="tabpanel"
              aria-label={item.label}
              className={`min-h-0 flex-1 ${tab === item.id ? 'flex' : 'hidden'}`}
            >
              {panels[item.id]}
            </div>
          ) : null,
        )}
      </div>
    </div>
  )

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')
  return overlayRoot ? createPortal(content, overlayRoot) : content
}
