'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { Menubar } from '@base-ui/react/menubar'

import { shortcutLabel } from '@/lib/shortcut-label'
import { runUpdateCheck } from '@/lib/update-check-ui'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { useSettings } from '@/lib/settings'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { useExportCenter } from '@/components/shared/export/ExportCenterHost'
import { JournalTimelineDialog } from '@/features/vault/components/JournalTimelineDialog'
import { useActiveEditor } from '@/lib/editor-context'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { runSaveBarrier } from '@/lib/save-barrier'
import { reportSaveBarrierFailures } from '@/lib/save-feedback'
import { currentStatus } from '@/lib/vault/vault-persist'
import { VaultMenuSection } from '@/features/vault'
import { useVault } from '@/lib/vault/vault-provider'
import { NativeMacMenu } from './NativeMacMenu'
import { toast } from 'sonner'
import { pasteTextIntoEditor } from '@/lib/clipboard-paste'
import { tauriReadClipboard } from '@/lib/tauri-clipboard'
import { insertIntoInput, isTextField, selectAllInInput } from '@/lib/insert-into-input'
import { isMacOS } from '@/lib/env'
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

/** 菜单栏四个顶级菜单：键 → 显示名（Alt 助记键就是 key 的大写） */
const MENUS = [
  { key: 'file', label: '文件' },
  { key: 'edit', label: '编辑' },
  { key: 'view', label: '视图' },
  { key: 'help', label: '帮助' },
] as const

type MenuKey = (typeof MENUS)[number]['key']

/**
 * 桌面菜单栏（文件 / 编辑 / 视图 / 帮助）。
 *
 * 用 Base UI 的 `Menubar` 而不是四个并列的 `DropdownMenu`：打开一个之后悬停另一个
 * 即切换、←/→ 在顶级菜单间移动、Esc 关闭并把焦点还给触发器 —— 这些原生菜单栏的行为
 * 以前是靠 document 上的 `mousemove` + 10ms 定时器手写的（那段代码已删除）。
 *
 * 键盘激活（与 Windows 习惯一致，macOS 下不生效 —— 那边菜单在系统栏里）：
 * - 单独按一下再松开 Alt（中间没按别的键），或按 F10 → 焦点落到「文件」
 * - Alt+F / Alt+E / Alt+V / Alt+H → 直接打开对应菜单（菜单名后不写助记字母）
 *
 * 窗口控制见 `WindowControls`，搜索见 `MenuBarSearch`，macOS 的系统菜单见 `NativeMacMenu`。
 */
export function MenuBarMenus() {
  const { settings, updateSetting } = useSettings()
  const vault = useVault()
  const { openSettings } = useSettingsTrigger()
  const { handleImportClick, dialog: importExportDialog } = useImportExport()
  const { activeEditor } = useActiveEditor()
  const openExportCenter = useExportCenter()
  const [journalOpen, setJournalOpen] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  /**
   * 保存：与 `AppShell` 的 Ctrl/Cmd+S、关窗、换库走**同一个保存屏障** ——
   * 先等草稿提交，再等落盘队列排干；失败给「保存未完成」，不制造「已保存」假回执。
   */
  const { status: saveStatus } = useSaveStatus()
  const handleSave = useCallback(() => {
    const wasClean = saveStatus !== 'dirty' && saveStatus !== 'saving'
    const beforeWriteAt = currentStatus().lastFlushedAt
    const hadQueuedWrites = currentStatus().pending > 0
    void (async () => {
      const failures = await runSaveBarrier()
      if (failures.length > 0) {
        reportSaveBarrierFailures(failures)
        return
      }
      // 笔记 / 小说是自动保存的，没有「脏表单」可存 —— 这时点「保存」以前什么都不发生，
      // 看起来像按钮坏了。给一句明确的回执，别让用户去猜。
      // 隐藏的常驻编辑器也可能刚被屏障写掉：写过盘就不说「没有改动」。
      const wroteSomething = currentStatus().lastFlushedAt !== beforeWriteAt
      if (wasClean && !hadQueuedWrites && !wroteSomething) {
        toast('没有需要保存的改动', { description: '已保存' })
      }
    })()
  }, [saveStatus])

  const handleCheckUpdate = useCallback(() => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    void runUpdateCheck().finally(() => setCheckingUpdate(false))
  }, [checkingUpdate])

  const handleUndo = useCallback(() => {
    activeEditor?.chain().focus().undo().run()
  }, [activeEditor])

  const handleRedo = useCallback(() => {
    activeEditor?.chain().focus().redo().run()
  }, [activeEditor])

  /**
   * 编辑菜单的四个动作：焦点在编辑器里就对编辑器做，否则退回 `document.activeElement`
   * （搜索框 / 字段行 / 设置里的输入框）。以前 `if (!activeEditor) return` ——
   * 焦点在普通输入框时点「复制」什么都不发生。
   */
  const focusedText = (): HTMLInputElement | HTMLTextAreaElement | null => {
    const element = document.activeElement
    return isTextField(element) ? element : null
  }

  const handleCut = useCallback(() => {
    if (activeEditor) {
      activeEditor.view.focus()
      try { document.execCommand('cut') } catch { /* noop */ }
      return
    }
    const field = focusedText()
    if (!field) return
    field.focus()
    try { document.execCommand('cut') } catch { /* noop */ }
  }, [activeEditor])

  const handleCopy = useCallback(() => {
    if (activeEditor) {
      activeEditor.view.focus()
      try { document.execCommand('copy') } catch { /* noop */ }
      return
    }
    const field = focusedText()
    if (!field) return
    field.focus()
    try { document.execCommand('copy') } catch { /* noop */ }
  }, [activeEditor])

  const handlePaste = useCallback(() => {
    if (activeEditor) {
      activeEditor.view.focus()
      void pasteTextIntoEditor(activeEditor)
      return
    }
    const field = focusedText()
    if (!field) return
    // 普通输入框没有 ProseMirror 的粘贴管线：读剪贴板文本 → 原生 setter 写值 → 派发 input
    void tauriReadClipboard()
      .then((text) => {
        if (text) insertIntoInput(field, text)
      })
      .catch(() => {})
  }, [activeEditor])

  const handleSelectAll = useCallback(() => {
    if (activeEditor) {
      activeEditor.chain().focus().selectAll().run()
      return
    }
    const field = focusedText()
    if (field) selectAllInInput(field)
  }, [activeEditor])

  /* ── 键盘激活菜单栏：F10 / 松开 Alt / Alt+字母 ────────────────── */
  useEffect(() => {
    // macOS 的菜单在系统栏里，这段不生效（[data-os='mac'] 下也不显示这排菜单）
    if (isMacOS()) return

    /** 按着 Alt 期间有没有按过别的键 —— 按过就不算「单独按 Alt」 */
    let altOnly = false

    const triggerOf = (key: MenuKey): HTMLButtonElement | null =>
      barRef.current?.querySelector<HTMLButtonElement>(`[data-menubar-trigger="${key}"]`) ?? null

    const focusMenu = (key: MenuKey): void => {
      triggerOf(key)?.focus()
    }

    const openMenu = (key: MenuKey): void => {
      triggerOf(key)?.click()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'F10') {
        event.preventDefault()
        focusMenu('file')
        return
      }
      if (event.key === 'Alt') {
        if (!event.repeat) altOnly = true
        return
      }
      // 按了别的键（含 Ctrl / Shift 组合）就取消「单独 Alt」
      if (altOnly) altOnly = false
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const match = MENUS.find((menu) => menu.key === event.key.toLowerCase())
      if (!match) return
      event.preventDefault()
      openMenu(match.key)
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt') return
      if (!altOnly) return
      altOnly = false
      event.preventDefault()
      focusMenu('file')
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <>
      {/* macOS：窗口内那排菜单由 CSS 隐藏（见 globals.css 的 [data-inapp-menus]），
          动作改由系统菜单栏承担 —— 两边调的是同一批 handler，不是两套实现。 */}
      <NativeMacMenu
        vaultName={vault.name}
        recentVaults={vault.recent}
        onOpenFolder={() => void vault.openFolder()}
        onCreateFolder={() => void vault.createFolder()}
        onOpenRecent={(path) => void vault.openFolder(path)}
        onJournal={() => setJournalOpen(true)}
        onImport={handleImportClick}
        onExportCenter={() => openExportCenter()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        sidebarVisible={settings.sidebarVisible}
        onToggleSidebar={() => updateSetting("sidebarVisible", !settings.sidebarVisible)}
        theme={settings.theme}
        onTheme={(theme) => updateSetting("theme", theme)}
        onAbout={() => openSettings("about")}
      />
      <div data-inapp-menus className="hidden md:block">
        <Menubar ref={barRef} className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger data-menubar-trigger="file">文件</DropdownMenuTrigger>
            <DropdownMenuContent>
              <VaultMenuSection
                extra={
                  <DropdownMenuItem onClick={() => setJournalOpen(true)}>
                    创作时间线...
                  </DropdownMenuItem>
                }
              />
              <DropdownMenuItem onClick={handleSave}>
                保存
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+S')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleImportClick}>
                导入...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openExportCenter()}>
                导出中心...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger data-menubar-trigger="edit">编辑</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleUndo}>
                撤销
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+Z')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRedo}>
                重做
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+Shift+Z')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCut}>
                剪切
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+X')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy}>
                复制
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+C')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePaste}>
                粘贴
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+V')}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSelectAll}>
                全选
                <DropdownMenuShortcut>{shortcutLabel('Ctrl+A')}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger data-menubar-trigger="view">视图</DropdownMenuTrigger>
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

          <DropdownMenu>
            <DropdownMenuTrigger data-menubar-trigger="help">帮助</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => openSettings("about")}>
                关于软件
              </DropdownMenuItem>
              <DropdownMenuItem disabled={checkingUpdate} onClick={handleCheckUpdate}>
                {checkingUpdate ? '正在检查更新…' : '检查更新...'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Menubar>
      </div>
      {importExportDialog}
      <JournalTimelineDialog open={journalOpen} onOpenChange={setJournalOpen} />
    </>
  )
}
