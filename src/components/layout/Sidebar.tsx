'use client'

import { useState } from 'react'
import {
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
import { GlobalAlbum } from '@/components/shared/GlobalAlbum'

const navItems = [
  { label: '角色', icon: Users },
  { label: '事件', icon: Calendar },
  { label: '国家', icon: Flag },
  { label: '世界观', icon: BookOpen },
  { label: '时间线', icon: Clock },
  { label: '关系图', icon: GitBranch },
] as const

export function Sidebar() {
  const { activeItem, setActiveItem } = useNavigation()
  const { openSettings } = useSettingsTrigger()
  const [albumOpen, setAlbumOpen] = useState(false)

  return (
    <aside data-sidebar className="flex h-full w-[140px] shrink-0 flex-col overflow-y-auto border-r border-line bg-transparent aside-scroll">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = activeItem === item.label
          return (
            <button
              key={item.label}
              onClick={() => setActiveItem(item.label)}
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-black/5 dark:bg-white/5 text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <item.icon size={16} strokeWidth={2} />
              <span className="transparent-text">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        <button
          onClick={() => setAlbumOpen(true)}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Images size={16} strokeWidth={2} />
          <span className="transparent-text">相册</span>
        </button>
        <button
          onClick={() => setActiveItem('回收站')}
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
            activeItem === '回收站'
              ? 'bg-black/10 dark:bg-white/10 text-ink'
              : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Trash2 size={16} strokeWidth={2} />
          <span className="transparent-text">回收站</span>
        </button>
        <button
          onClick={() => openSettings()}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Settings size={16} strokeWidth={2} />
          <span className="transparent-text">设置</span>
        </button>
      </div>

      {albumOpen ? <GlobalAlbum onClose={() => setAlbumOpen(false)} /> : null}
    </aside>
  )
}
