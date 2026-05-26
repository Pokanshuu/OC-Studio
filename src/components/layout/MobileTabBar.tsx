'use client'

import { BookOpen, Globe, Clock, GitBranch, Images } from 'lucide-react'
import { useNavigation } from './NavigationContext'
import { useMobileNavigation, type MobileSection } from './MobileNavigationContext'

const tabs: { section: MobileSection; label: string; icon: typeof BookOpen }[] = [
  { section: 'gallery', label: '图鉴', icon: BookOpen },
  { section: 'wiki', label: '世界观', icon: Globe },
  { section: 'timeline', label: '时间线', icon: Clock },
  { section: 'relations', label: '关系图', icon: GitBranch },
  { section: 'album', label: '相册', icon: Images },
]

export function MobileTabBar() {
  const { section, setSection } = useMobileNavigation()
  const { setActiveItem } = useNavigation()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 border-t border-line bg-paper/80 pb-[env(safe-area-inset-bottom,8px)] backdrop-blur-md">
      <div className="flex h-full items-center">
        {tabs.map((tab) => {
          const isActive = section === tab.section
          return (
            <button
              key={tab.section}
              onClick={() => {
                setActiveItem(null)
                setSection(tab.section)
              }}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 h-full py-1 transition-colors"
            >
              <tab.icon
                size={20}
                strokeWidth={2}
                className={isActive ? 'text-ink' : 'text-ink-faint'}
              />
              <span
                className={`text-[10px] leading-none ${
                  isActive ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
