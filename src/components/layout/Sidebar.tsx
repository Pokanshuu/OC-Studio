'use client'

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Settings, Trash2, Plus, Users } from 'lucide-react'
import { ALBUM_ITEM, HOME_ITEM, NAV_GROUPS, toolIcon } from '@/lib/nav-sections'
import { useNavigation } from './NavigationContext'
import { useSettingsTrigger } from './SettingsTriggerContext'
import { useTrashOverlay } from './TrashOverlayContext'
import { useSettings } from '@/lib/settings'
import { categoryIconOf } from '@/lib/categories/icons'
import { updateCategory, useCategories } from '@/lib/categories/store'
import { categoryItemName } from '@/lib/categories/types'
import type { Category } from '@/lib/categories/types'
import { toolItem } from '@/lib/entry-kinds'
import { isPluginEnabled, isSidebarTool, isToolPlugin, usePlugins } from '@/lib/plugins'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { notifyDataUpdated } from '@/lib/data-events'
import { toast } from 'sonner'
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from '@/lib/sidebar-width'

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
  const { plugins } = usePlugins()
  const categories = useCategories()
  /**
   * 侧栏「工具」= 可用、已启用、**且占导航位**的功能插件。
   *
   * `nav: 'contextual'` 的**不**在这里：它没有「泛泛地打开」这回事，入口在某个
   * 具体界面里（当初地图生成器就是这种，后来它变成「造一张新地图」的独立入口，
   * 改成了 `sidebar`，见 `lib/plugins/official.ts`）。
   *
   * **开发构建例外**：上下文插件的独立页面仍然列出来，否则那个页面没有入口、
   * 没法单独调试。生产构建里 `NODE_ENV === 'production'`，这里为 false。
   */
  const showContextual = process.env.NODE_ENV !== 'production'
  const toolPlugins = plugins.filter(
    (plugin) => (isSidebarTool(plugin) || (showContextual && isToolPlugin(plugin))) && isPluginEnabled(plugin),
  )
  const [categoryDialog, setCategoryDialog] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; category: Category }
    | null
  >(null)
  const [categoryMenu, setCategoryMenu] = useState<{ category: Category; at: { x: number; y: number } } | null>(null)

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
            <HOME_ITEM.icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="transparent-text">{HOME_ITEM.label}</span>
          </button>

          {/* 分组（图鉴 / 创作 / 视图）来自 `lib/nav-sections.ts`，命令面板共用同一份 */}
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className={GROUP_LABEL}>{group.label}</div>
              {group.items.map((item) => renderItem(item.label, item.icon))}
            </div>
          ))}

          {/* 工具：插件给的能力面板。装 / 关都在 设置 › 插件，这里只列已启用的 */}
          {toolPlugins.length > 0 ? (
            <>
              <div className={GROUP_LABEL}>工具</div>
              {toolPlugins.map((plugin) => {
                const Icon = toolIcon(plugin.id)
                const item = toolItem(plugin.id)
                return (
                  <button
                    key={plugin.id}
                    onClick={() => setActiveItem(item)}
                    className={`${ITEM_BASE} ${activeItem === item ? ITEM_ON : ITEM_OFF}`}
                  >
                    <Icon size={16} strokeWidth={2} className="shrink-0" />
                    <span className="transparent-text">{plugin.name}</span>
                  </button>
                )
              })}
            </>
          ) : null}

          {/* 自定义分类：分类 = 模板 + 一组笔记（宠物 / 武器 都住在这里，不塞进角色）。
              排在工具之后 —— 它是自己长出来的那一层，位置贴着底部固定区。 */}
          <div className={GROUP_LABEL}>自定义分类</div>
          {categories.filter((category) => category.enabled).map((category) => {
            const Icon = categoryIconOf(category.icon)
            const item = categoryItemName(category.id)
            return (
              <button
                key={category.id}
                onClick={() => setActiveItem(item)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setCategoryMenu({ category, at: { x: event.clientX, y: event.clientY } })
                }}
                className={`${ITEM_BASE} ${activeItem === item ? ITEM_ON : ITEM_OFF}`}
              >
                <Icon size={16} strokeWidth={2} className="shrink-0" />
                <span className="transparent-text">{category.name}</span>
              </button>
            )
          })}
          <button onClick={() => setCategoryDialog({ mode: 'create' })} className={`${ITEM_BASE} ${ITEM_OFF}`}>
            <Plus size={16} strokeWidth={2} className="shrink-0" />
            <span className="transparent-text">新建分类</span>
          </button>
        </nav>

        <CategoryDialog
          open={categoryDialog !== null}
          category={categoryDialog?.mode === 'edit' ? categoryDialog.category : undefined}
          onClose={() => setCategoryDialog(null)}
          onCreated={(created) => setActiveItem(categoryItemName(created.id))}
          onDeleted={(id) => {
            if (activeItem === categoryItemName(id)) setActiveItem(null)
          }}
        />

        {categoryMenu ? (
          <MediaContextMenu
            at={categoryMenu.at}
            onClose={() => setCategoryMenu(null)}
            items={[
              categoryMenu.category.builtin
                ? {
                    label: '停用',
                    onSelect: () => {
                      if (activeItem === categoryItemName(categoryMenu.category.id)) setActiveItem(null)
                      void updateCategory(categoryMenu.category.id, { enabled: false })
                        .then(() => notifyDataUpdated())
                        .catch((err: unknown) => {
                          toast.error('停用失败', { description: String(err) })
                        })
                    },
                  }
                : {
                    label: '编辑分类',
                    onSelect: () => setCategoryDialog({ mode: 'edit', category: categoryMenu.category }),
                  },
            ]}
          />
        ) : null}

        {/* 底部固定区：相册 / 回收站 / 设置 —— 不是「内容」，一直贴在最下面 */}
        {/* 这条线压在模糊 / 背景图上：用半透明的线，别让实色 `line` 突然亮一截 */}
        <div className="flex flex-col border-t border-line-soft py-2">
          {renderItem(ALBUM_ITEM.label, ALBUM_ITEM.icon)}
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
