'use client'

import {
  Users,
  Calendar,
  Flag,
  BookOpen,
  Clock,
  GitBranch,
  Settings,
} from 'lucide-react'
import { useNavigation } from './NavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'

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

  return (
    <aside className="flex h-full w-[120px] shrink-0 flex-col overflow-y-auto border-r border-line bg-paper-alt aside-scroll">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = activeItem === item.label
          return (
            <button
              key={item.label}
              onClick={() => setActiveItem(item.label)}
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-paper-card text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <item.icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        <button
          onClick={() => openSettings()}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <Settings size={16} strokeWidth={2} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  )
}
