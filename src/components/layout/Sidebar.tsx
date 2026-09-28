'use client'

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

const CONTENT_ITEMS = [
  { label: '角色', icon: Users },
  { label: '事件', icon: Calendar },
  { label: '国家', icon: Flag },
  { label: '世界观', icon: BookOpen },
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

export function Sidebar() {
  const { activeItem, setActiveItem } = useNavigation()
  const { openSettings } = useSettingsTrigger()
  const { openTrash } = useTrashOverlay()

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
    <aside
      data-sidebar
      className="max-md:hidden flex h-full w-[140px] shrink-0 flex-col overflow-y-auto border-r border-line bg-transparent aside-scroll"
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

        <div className={GROUP_LABEL}>内容</div>
        {CONTENT_ITEMS.map((item) => renderItem(item.label, item.icon))}

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
  )
}
