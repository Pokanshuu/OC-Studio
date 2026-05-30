'use client'

import { useState } from 'react'
import { Search, Trash2, Settings, Menu } from 'lucide-react'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { useMobileNavigation, type GallerySubTab } from './MobileNavigationContext'
import { useNavigation } from './NavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'
import { useTrashOverlay } from './TrashOverlayContext'
import { useMobilePageHeader } from './MobilePageHeaderContext'

const SECTION_TITLES: Record<string, string> = {
  wiki: '世界观',
  timeline: '时间线',
  relations: '关系图',
  album: '相册',
}

const GALLERY_TABS: { key: GallerySubTab; label: string }[] = [
  { key: 'characters', label: '角色' },
  { key: 'events', label: '事件' },
  { key: 'countries', label: '国家' },
]

export function MobileTopBar() {
  const { section, gallerySubTab, setGallerySubTab } = useMobileNavigation()
  const { setActiveItem } = useNavigation()
  const { openSettings } = useSettingsTrigger()
  const { openTrash } = useTrashOverlay()
  const { title: pageTitle } = useMobilePageHeader()
  const [searchOpen, setSearchOpen] = useState(false)

  const isGallery = section === 'gallery'
  const needsMenu = section === 'wiki' || section === 'album'

  const displayTitle = pageTitle ?? (SECTION_TITLES[section] ?? 'OC Studio')

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-20 flex h-[calc(60px+var(--safe-top))] items-center justify-between border-b border-line bg-paper/80 px-4 pt-[var(--safe-top)] backdrop-blur-lg dark:bg-[#1C1B1A]/80">
      {/* Left: action button + text tabs (gallery) or section title */}
      <div className="flex items-center gap-2">
        {!isGallery && needsMenu ? (
          <button
            onClick={() => {
              if (section === 'wiki') window.dispatchEvent(new Event('worldToggle'))
              else if (section === 'album') window.dispatchEvent(new Event('albumToggle'))
            }}
            className="flex h-10 w-10 items-center justify-center rounded -ml-1 text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
            aria-label="目录"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        ) : null}
        {isGallery ? (
          <div className="flex items-center gap-4 pl-2">
            {GALLERY_TABS.map((t) => {
              const isActive = gallerySubTab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setGallerySubTab(t.key)}
                  className={`transition-all duration-200 font-serif ${
                    isActive
                      ? 'scale-110 text-xl font-bold text-ink'
                      : 'scale-100 text-base font-normal text-ink-faint'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        ) : (
          <span className={`text-xl font-serif font-bold text-ink ${needsMenu ? '' : 'pl-2'}`}>{displayTitle}</span>
        )}
      </div>

      {/* Right: action icons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
          aria-label="搜索"
        >
          <Search size={20} strokeWidth={2} />
        </button>
        <button
          onClick={openTrash}
          className="flex h-10 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
          aria-label="回收站"
        >
          <Trash2 size={20} strokeWidth={2} />
        </button>
        <button
          onClick={() => openSettings()}
          className="flex h-10 w-10 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8"
          aria-label="设置"
        >
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>

      <MobileSearchOverlay key={searchOpen ? 'open' : 'closed'} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
