'use client'

import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { useProjectMeta } from '@/features/project'
import { MenuBarSearch } from './MenuBarSearch'
import { MenuBarMenus } from './MenuBarMenus'
import { WindowControls } from './WindowControls'

/**
 * 顶栏外壳：品牌按钮 + 菜单（`MenuBarMenus`）+ 搜索（`MenuBarSearch`）+ 窗口控制（`WindowControls`）。
 */
export function MenuBar() {
  const { openSettings } = useSettingsTrigger()
  const { meta } = useProjectMeta()

  return (
    <nav
      data-menubar
      data-tauri-drag-region
      className="max-md:hidden relative flex h-8 shrink-0 items-center justify-between bg-transparent px-3"
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => openSettings('world')}
          title="编辑世界信息"
          className="bg-transparent font-serif text-[13px] text-ink transparent-text transition-colors hover:bg-transparent hover:text-ink-muted"
        >
          {meta.worldName.trim() || 'OC Studio'}
        </button>
        <MenuBarMenus />
      </div>

      <MenuBarSearch />

      <WindowControls />
    </nav>
  )
}
