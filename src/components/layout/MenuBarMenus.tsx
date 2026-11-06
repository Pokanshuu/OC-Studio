'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { tauriReadClipboard } from '@/lib/tauri-clipboard'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { useSettings } from '@/lib/settings'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { useExportCenter } from '@/components/shared/export/ExportCenterHost'
import { JournalTimelineDialog } from '@/features/vault/components/JournalTimelineDialog'
import { useActiveEditor } from '@/lib/editor-context'
import { VaultMenuSection } from '@/features/vault'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'


/**
 * 桌面菜单栏的四组下拉（文件 / 编辑 / 视图 / 关于）与悬停切换逻辑，
 * 以及 `useImportExport` 的导入导出弹窗。窗口控制见 `WindowControls`，搜索见 `MenuBarSearch`。
 */
export function MenuBarMenus() {
  const { settings, updateSetting } = useSettings()
  const { openSettings } = useSettingsTrigger()
  const { handleImportClick, dialog: importExportDialog } = useImportExport()
  const { activeEditor } = useActiveEditor()
  const openExportCenter = useExportCenter()
  const [journalOpen, setJournalOpen] = useState(false)

  const handleUndo = useCallback(() => {
    activeEditor?.chain().focus().undo().run()
  }, [activeEditor])

  const handleRedo = useCallback(() => {
    activeEditor?.chain().focus().redo().run()
  }, [activeEditor])

  const handleCut = useCallback(() => {
    if (!activeEditor) return
    activeEditor.view.focus()
    try { document.execCommand('cut') } catch { /* noop */ }
  }, [activeEditor])

  const handleCopy = useCallback(() => {
    if (!activeEditor) return
    activeEditor.view.focus()
    try { document.execCommand('copy') } catch { /* noop */ }
  }, [activeEditor])

  const handlePaste = useCallback(() => {
    if (!activeEditor) return
    activeEditor.view.focus()
    tauriReadClipboard()
      .then((text) => { activeEditor.chain().focus().insertContent(text).run() })
      .catch(() => {})
  }, [activeEditor])

  const handleSelectAll = useCallback(() => {
    activeEditor?.chain().focus().selectAll().run()
  }, [activeEditor])


  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const openMenuRef = useRef<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setOpen = (v: string | null) => {
    openMenuRef.current = v
    setOpenMenu(v)
  }

  const scheduleSwitch = (menu: string) => {
    if (!openMenuRef.current || openMenuRef.current === menu) return
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setOpen(menu), 10)
  }

  useEffect(() => {
    if (!openMenu) return

    const handler = (e: MouseEvent) => {
      const triggers = document.querySelectorAll('[data-menu-trigger]')
      for (const el of triggers) {
        const rect = el.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          const menu = el.getAttribute('data-menu-trigger')
          if (menu && menu !== openMenuRef.current) {
            scheduleSwitch(menu)
          }
          break
        }
      }
    }

    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [openMenu]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
        <div className="hidden md:flex md:items-center md:gap-1">
          <DropdownMenu open={openMenu === 'file'} onOpenChange={(o) => { if (o) setOpen('file'); else if (openMenuRef.current === 'file') setOpen(null) }}>
            <span data-menu-trigger="file">
              <DropdownMenuTrigger>文件</DropdownMenuTrigger>
            </span>
            <DropdownMenuContent>
              <VaultMenuSection
                extra={
                }
              />
              <DropdownMenuItem onClick={handleImportClick}>
                导入...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openExportCenter()}>
                导出中心...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu open={openMenu === 'edit'} onOpenChange={(o) => { if (o) setOpen('edit'); else if (openMenuRef.current === 'edit') setOpen(null) }}>
            <span data-menu-trigger="edit">
              <DropdownMenuTrigger>编辑</DropdownMenuTrigger>
            </span>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleUndo}>
                撤销
                <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRedo}>
                重做
                <DropdownMenuShortcut>Ctrl+Shift+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCut}>
                剪切
                <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy}>
                复制
                <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePaste}>
                粘贴
                <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSelectAll}>
                全选
                <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu open={openMenu === 'view'} onOpenChange={(o) => { if (o) setOpen('view'); else if (openMenuRef.current === 'view') setOpen(null) }}>
            <span data-menu-trigger="view">
              <DropdownMenuTrigger>视图</DropdownMenuTrigger>
            </span>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => updateSetting("sidebarVisible", !settings.sidebarVisible)}>
                {settings.sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  显示模式
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => updateSetting("theme", "light")}>
                    <span>白天模式</span>
                    {settings.theme === "light" ? <Check size={14} strokeWidth={2} className="ml-auto" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateSetting("theme", "dark")}>
                    <span>夜间模式</span>
                    {settings.theme === "dark" ? <Check size={14} strokeWidth={2} className="ml-auto" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateSetting("theme", "auto")}>
                    <span>跟随系统</span>
                    {settings.theme === "auto" ? <Check size={14} strokeWidth={2} className="ml-auto" /> : null}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu open={openMenu === 'about'} onOpenChange={(o) => { if (o) setOpen('about'); else if (openMenuRef.current === 'about') setOpen(null) }}>
            <span data-menu-trigger="about">
              <DropdownMenuTrigger>关于</DropdownMenuTrigger>
            </span>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => openSettings("about")}>
                关于软件
              </DropdownMenuItem>
              <DropdownMenuItem disabled onClick={() => {}}>
                检查更新...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      {importExportDialog}
      <JournalTimelineDialog open={journalOpen} onOpenChange={setJournalOpen} />
    </>
  )
}




