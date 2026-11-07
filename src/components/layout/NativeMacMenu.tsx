'use client'

import { useEffect, useRef } from 'react'
import { isMacOS, isTauri } from '@/lib/env'

/**
 * macOS 系统菜单栏（原生 NSMenu）的唯一实现。
 *
 * 为什么要有它：macOS 的菜单是**屏幕顶部那条**，不是窗口里的一条。窗口内再摆一排
 * 「文件 / 编辑 / 视图」既不符合平台习惯，也会和原生菜单重复。所以 macOS 下
 * 窗口内那排由 CSS 隐藏（`[data-os='mac'] [data-inapp-menus]`），动作改由这里注册。
 *
 * 三条设计约束：
 * 1. **动作只有一份**：这里的每个回调都是 `MenuBarMenus` 里现成的 handler，
 *    不做第二套实现 —— Windows/Linux 的自绘菜单与 macOS 的原生菜单点同一个函数。
 * 2. **只在 Tauri + macOS 下建菜单**：浏览器预览里 `isTauri()` 为假，直接跳过。
 * 3. **不随每次 render 重建**：回调放在 ref 里，只有「菜单结构会变」的状态
 *   （库名 / 最近打开 / 侧栏 / 主题）进依赖键。否则每次父组件渲染都会重设一遍 App 菜单。
 *
 * 剪切 / 复制 / 粘贴 / 全选用 `PredefinedMenuItem`：它们由 AppKit 转发给第一响应者，
 * 输入框、正文、表格都能用，不需要我们自己判断焦点在谁身上。
 * 撤销 / 重做必须走编辑器（Tiptap 有自己的 history），所以用自定义项。
 */
export interface NativeMacMenuProps {
  vaultName: string | null
  recentVaults: ReadonlyArray<{ path: string; name: string }>
  onOpenFolder: () => void
  onCreateFolder: () => void
  onOpenRecent: (path: string) => void
  onJournal: () => void
  onImport: () => void
  onExportCenter: () => void
  onUndo: () => void
  onRedo: () => void
  sidebarVisible: boolean
  onToggleSidebar: () => void
  theme: string
  onTheme: (theme: 'light' | 'dark' | 'auto') => void
  onAbout: () => void
}

export function NativeMacMenu(props: NativeMacMenuProps) {
  const latest = useRef(props)
  // 回调要读到最新的 props，但不能让回调用进「重建菜单」的依赖里（否则每次渲染都重设菜单）。
  // 写 ref 放在 effect 里：React 不允许在 render 期间改 ref。
  useEffect(() => {
    latest.current = props
  })

  // 依赖键：只放「菜单结构或勾选状态会变」的东西，回调不进依赖。
  const structuralKey = JSON.stringify({
    vault: props.vaultName,
    recent: props.recentVaults.map((entry) => entry.path),
    sidebar: props.sidebarVisible,
    theme: props.theme,
  })

  useEffect(() => {
    if (!isMacOS() || !isTauri()) return
    let cancelled = false

    const build = async () => {
      const { Menu, Submenu, MenuItem, PredefinedMenuItem, CheckMenuItem } = await import(
        '@tauri-apps/api/menu'
      )
      if (cancelled) return

      const current = latest.current
      const sep = () => PredefinedMenuItem.new({ item: 'Separator' })

      const recentItems = current.recentVaults.slice(0, 12).map((entry) =>
        MenuItem.new({
          text: entry.name || entry.path,
          action: () => latest.current.onOpenRecent(entry.path),
        }),
      )

      const fileItems = [
        await MenuItem.new({
          text: '打开本地文件夹…',
          accelerator: 'CmdOrCtrl+O',
          action: () => latest.current.onOpenFolder(),
        }),
        await MenuItem.new({
          text: '新建本地文件夹…',
          action: () => latest.current.onCreateFolder(),
        }),
        ...(recentItems.length > 0
          ? [await sep(), await Submenu.new({ text: '最近打开', items: await Promise.all(recentItems) })]
          : []),
        await sep(),
        await MenuItem.new({
          text: '创作时间线…',
          action: () => latest.current.onJournal(),
        }),
        await MenuItem.new({
          text: '导入…',
          action: () => latest.current.onImport(),
        }),
        await sep(),
        await MenuItem.new({
          text: '导出中心…',
          accelerator: 'CmdOrCtrl+E',
          action: () => latest.current.onExportCenter(),
        }),
      ]

      const editItems = [
        await MenuItem.new({
          text: '撤销',
          accelerator: 'CmdOrCtrl+Z',
          action: () => latest.current.onUndo(),
        }),
        await MenuItem.new({
          text: '重做',
          accelerator: 'Shift+CmdOrCtrl+Z',
          action: () => latest.current.onRedo(),
        }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Cut', text: '剪切' }),
        await PredefinedMenuItem.new({ item: 'Copy', text: '复制' }),
        await PredefinedMenuItem.new({ item: 'Paste', text: '粘贴' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'SelectAll', text: '全选' }),
      ]

      const viewItems = [
        await CheckMenuItem.new({
          text: '侧边栏',
          checked: current.sidebarVisible,
          action: () => latest.current.onToggleSidebar(),
        }),
        await sep(),
        await Submenu.new({
          text: '显示模式',
          items: [
            await CheckMenuItem.new({
              text: '白天模式',
              checked: current.theme === 'light',
              action: () => latest.current.onTheme('light'),
            }),
            await CheckMenuItem.new({
              text: '夜间模式',
              checked: current.theme === 'dark',
              action: () => latest.current.onTheme('dark'),
            }),
            await CheckMenuItem.new({
              text: '跟随系统',
              checked: current.theme === 'auto',
              action: () => latest.current.onTheme('auto'),
            }),
          ],
        }),
      ]

      const appItems = [
        await MenuItem.new({ text: '关于软件', action: () => latest.current.onAbout() }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Hide', text: '隐藏 OC Studio' }),
        await PredefinedMenuItem.new({ item: 'HideOthers', text: '隐藏其他' }),
        await PredefinedMenuItem.new({ item: 'ShowAll', text: '显示全部' }),
        await sep(),
        await PredefinedMenuItem.new({ item: 'Quit', text: '退出 OC Studio' }),
      ]

      const menu = await Menu.new({
        items: [
          await Submenu.new({ text: 'OC Studio', items: appItems }),
          await Submenu.new({ text: '文件', items: fileItems }),
          await Submenu.new({ text: '编辑', items: editItems }),
          await Submenu.new({ text: '视图', items: viewItems }),
        ],
      })
      if (cancelled) return
      await menu.setAsAppMenu()
    }

    void build().catch(() => {
      /* 非 Tauri / 无权限时静默跳过：菜单不是功能必需 */
    })

    return () => {
      cancelled = true
    }
  }, [structuralKey])

  return null
}
