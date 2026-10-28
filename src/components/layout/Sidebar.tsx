'use client'

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  House,
  Users,
  Calendar,
  Flag,
  BookOpen,
  Clock,
  GitBranch,
  Settings,
  Trash2,
  Images,
} from 'lucide-react'
import { useNavigation } from './NavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'
import { useTrashOverlay } from './TrashOverlayContext'
import { useSettings } from '@/lib/settings'
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from '@/lib/sidebar-width'

const CREATE_ITEMS = [
  { label: '世界观', icon: BookOpen },
] as const

const CODEX_ITEMS = [
  { label: '角色', icon: Users },
  { label: '事件', icon: Calendar },
  { label: '国家', icon: Flag },
] as const

const VIEW_ITEMS = [
  { label: '时间线', icon: Clock },
  { label: '关系图', icon: GitBranch },
  { label: '相册', icon: Images },
] as const

const ITEM_BASE =
  'relative flex h-8 w-full items-center gap-2 px-4 text-left text-[13px] transition-colors'
const ITEM_OFF = 'text-ink-muted hover:text-ink hover:bg-[var(--oc-hover)]'
const ITEM_ON =
  "text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:bg-ink before:content-['']"
const GROUP_LABEL = 'px-4 pb-1.5 pt-3 text-[11px] tracking-[0.14em] text-ink-faint'

const subscribeNoop = () => () => {}

/** 「客户端了吗」：服务端渲染 / 水合首屏为 false，水合完成后为 true（React 会补这次渲染，不报水合不一致） */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}

export function Sidebar() {
  const { activeItem, setActiveItem } = useNavigation()
  const { openSettings } = useSettingsTrigger()
  const { openTrash } = useTrashOverlay()
  const { settings, updateSetting } = useSettings()

  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // 宽度的真源在 localStorage（设置），服务端渲染读不到 —— 先按默认宽度出 HTML，
  // 水合后再切到用户宽度。用 useSyncExternalStore 表达「客户端了吗」：React 会自己补这次
  // 渲染，也不会报水合不一致；直接拿 settings 当 style 的话属性对不上，而且之后不会补渲染。
  const hydrated = useHydrated()
  const width = hydrated
    ? dragWidth ?? clampSidebarWidth(settings.sidebarWidth)
    : DEFAULT_SIDEBAR_WIDTH
  const dragRef = useRef<{ startX: number; startWidth: number; last: number } | null>(null)

  const commitWidth = (next: number) => {
    setDragWidth(null)
    updateSetting('sidebarWidth', clampSidebarWidth(next))
  }

  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setDragWidth(null)
    if (drag) updateSetting('sidebarWidth', clampSidebarWidth(drag.last))
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startWidth: width, last: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setDragWidth(width)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    drag.last = clampSidebarWidth(drag.startWidth + (e.clientX - drag.startX))
    setDragWidth(drag.last)
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    endDrag()
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.shiftKey ? 16 : 4
    commitWidth(width + (e.key === 'ArrowRight' ? step : -step))
  }

  const renderItem = (
    label: string,
    Icon: typeof Users,
  ) => {
    const isActive = activeItem === label
    return (
      <button
        key={label}
        onClick={() => setActiveItem(label)}
        className={`${ITEM_BASE} ${isActive ? ITEM_ON : ITEM_OFF}`}
      >
        <Icon size={16} strokeWidth={2} className="shrink-0" />
        <span className="transparent-text">{label}</span>
      </button>
    )
  }

  return (
    <div className="relative flex shrink-0 max-md:hidden" style={{ width }}>
      <aside
        data-sidebar
        className="flex h-full w-full flex-col overflow-y-auto bg-transparent aside-scroll"
      >
        <nav className="flex flex-1 flex-col py-2">
          {/* 主页（概览）：activeItem 为 null 时显示 */}
          <button
            onClick={() => setActiveItem(null)}
            className={`${ITEM_BASE} ${activeItem === null ? ITEM_ON : ITEM_OFF}`}
          >
            <House size={16} strokeWidth={2} className="shrink-0" />
            <span className="transparent-text">主页</span>
          </button>

          {/* 图鉴 = 从世界里抽出来的条目；创作 = 你自己的世界（词条树） */}
          <div className={GROUP_LABEL}>图鉴</div>
          {CODEX_ITEMS.map((item) => renderItem(item.label, item.icon))}

          <div className={GROUP_LABEL}>创作</div>
          {CREATE_ITEMS.map((item) => renderItem(item.label, item.icon))}

          <div className={GROUP_LABEL}>视图</div>
          {VIEW_ITEMS.map((item) => renderItem(item.label, item.icon))}
        </nav>

        <div className="flex flex-col border-t border-line py-2">
          <button onClick={openTrash} className={`${ITEM_BASE} ${ITEM_OFF}`}>
            <Trash2 size={16} strokeWidth={2} className="shrink-0" />
            <span className="transparent-text">回收站</span>
          </button>
          <button onClick={() => openSettings()} className={`${ITEM_BASE} ${ITEM_OFF}`}>
            <Settings size={16} strokeWidth={2} className="shrink-0" />
            <span className="transparent-text">设置</span>
          </button>
        </div>
      </aside>

      {/* 右边缘的拖拽条：6px 命中区，悬停才显底色；双击回默认宽度 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => commitWidth(DEFAULT_SIDEBAR_WIDTH)}
        onKeyDown={handleKeyDown}
        className={`absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none transition-colors focus:outline-none ${
          dragWidth !== null ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
        }`}
      />
    </div>
  )
}
