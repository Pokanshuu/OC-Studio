'use client'

import { createElement, useState } from 'react'
import { BookText, House, Map, MoreHorizontal, Search, Settings, Menu, Table2, Trash2 } from 'lucide-react'
import { MobileSearchOverlay } from './MobileSearchOverlay'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { useMobileNavigation, type GallerySubTab } from './MobileNavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'
import { useTrashOverlay } from './TrashOverlayContext'
import { useMobilePageHeader } from './MobilePageHeaderContext'
import { useNavigation } from './NavigationContext'
import { useCategories } from '@/lib/categories/store'
import { categoryIconOf } from '@/lib/categories/icons'
import { categoryItemName } from '@/lib/categories/types'

const SECTION_TITLES: Record<string, string> = {
  wiki: '世界观',
  timeline: '时间线',
  relations: '关系图',
  album: '相册',
  home: '主页',
  novel: '小说',
  map: '地图',
  tree: '树表',
  category: '分类',
}

const GALLERY_TABS: { key: GallerySubTab; label: string }[] = [
  { key: 'characters', label: '角色' },
  { key: 'events', label: '事件' },
  { key: 'countries', label: '国家' },
]

const MORE_ITEMS: Array<{ label: string; section: 'home' | 'novel' | 'map' | 'tree'; icon: typeof House }> = [
  { label: '主页', section: 'home', icon: House },
  { label: '小说', section: 'novel', icon: BookText },
  { label: '地图', section: 'map', icon: Map },
  { label: '树表', section: 'tree', icon: Table2 },
]

export function MobileTopBar() {
  const { section, gallerySubTab, setGallerySubTab, setSection } = useMobileNavigation()
  const { setActiveItem } = useNavigation()
  const categories = useCategories()
  const { openSettings } = useSettingsTrigger()
  const { openTrash } = useTrashOverlay()
  const { title: pageTitle } = useMobilePageHeader()
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const isGallery = section === 'gallery'
  const needsMenu = section === 'wiki' || section === 'album'

  // 手机没有侧栏：标题只看当前 section（gallery 走上方三个文字页签）
  const displayTitle = pageTitle ?? (SECTION_TITLES[section] ?? 'OC Studio')

  const moreActions: ActionItem[] = [
    ...MORE_ITEMS.map((item) => ({
      id: item.label,
      label: item.label,
      icon: <item.icon size={20} strokeWidth={2} />,
      onPress: () => {
        setSection(item.section)
        setMoreOpen(false)
      },
    })),
    ...categories.filter((category) => category.enabled).map((category) => ({
      id: categoryItemName(category.id),
      label: category.name,
      icon: createElement(categoryIconOf(category.icon), { size: 20, strokeWidth: 2 }),
      onPress: () => {
        setActiveItem(categoryItemName(category.id))
        setSection('category')
        setMoreOpen(false)
      },
    })),
  ]

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-20 flex h-[calc(60px+var(--safe-top))] items-center justify-between border-b border-line bg-paper/85 px-4 pt-[var(--safe-top)] backdrop-blur-lg">
      {/* Left: action button + text tabs (gallery) or section title */}
      <div className="flex items-center gap-2">
        {!isGallery && needsMenu ? (
          <button
            onClick={() => {
              if (section === 'wiki') window.dispatchEvent(new Event('worldToggle'))
              else if (section === 'album') window.dispatchEvent(new Event('albumToggle'))
            }}
            className="flex h-10 w-10 -ml-1 items-center justify-center text-ink-muted transition-colors hover:text-ink active:bg-[var(--oc-hover)]"
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
                  className={`px-1 font-serif text-lg transition-colors ${
                    isActive
                      ? 'font-bold text-ink'
                      : 'font-normal text-ink-faint'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        ) : (
          <span className={`font-serif text-lg font-bold text-ink ${needsMenu ? '' : 'pl-2'}`}>{displayTitle}</span>
        )}
      </div>

      {/* Right: action icons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setMoreOpen(true)}
          className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors hover:text-ink active:bg-[var(--oc-hover)]"
          aria-label="更多"
        >
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors hover:text-ink active:bg-[var(--oc-hover)]"
          aria-label="搜索"
        >
          <Search size={20} strokeWidth={2} />
        </button>
        <button
          onClick={openTrash}
          className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors hover:text-ink active:bg-[var(--oc-hover)]"
          aria-label="回收站"
        >
          <Trash2 size={20} strokeWidth={2} />
        </button>
        <button
          onClick={() => openSettings()}
          className="flex h-10 w-10 items-center justify-center text-ink-muted transition-colors hover:text-ink active:bg-[var(--oc-hover)]"
          aria-label="设置"
        >
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>

      <MobileSearchOverlay key={searchOpen ? 'open' : 'closed'} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MobileActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="更多"
        actions={moreActions}
      />
    </div>
  )
}
