"use client"

import { useState, useCallback, useEffect, type ReactNode } from "react"
import { MenuBar } from "@/components/layout/MenuBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { MobileTopBar } from "@/components/layout/MobileTopBar"
import { MobileTabBar } from "@/components/layout/MobileTabBar"
import { GlobalContextMenu } from "@/components/shared/GlobalContextMenu"
import { MobileTextSelectionBar } from "@/components/shared/mobile-text-selection/MobileTextSelectionBar"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { SettingsTriggerContext } from "@/components/layout/SettingsTriggerContext"
import { EditorProvider, useEditor } from "@/components/layout/EditorContext"
import { MobileNavigationProvider } from "@/components/layout/MobileNavigationContext"
import { TrashOverlayProvider, useTrashOverlay } from "@/components/layout/TrashOverlayContext"
import { MobilePageHeaderProvider } from "@/components/layout/MobilePageHeaderContext"
import { SaveStatusProvider, useSaveStatus } from "@/components/layout/SaveStatusContext"
import { TrashView } from "@/features/trash/components/TrashView"
import { loadFieldConfig } from "@/lib/fields"
import { VaultSurfaces, VaultWriteBanner } from "@/features/vault"
import { useVault } from "@/lib/vault/vault-provider"
import { useSettings } from "@/lib/settings"
import { useKeyboard } from "@/lib/KeyboardContext"
import { useBackButton } from "@/lib/useBackButton"
import { getChromiumVersion, isBelowTargetVersion, isHarmonyOS, getHarmonyOSVersion, isSafeAreaEnvAvailable, estimateSafeAreaInsets, getSafeAreaBottomCorrection, isMobilePlatform } from "@/lib/browser-compat"

function TrashOverlayRenderer() {
  const { trashOpen, closeTrash } = useTrashOverlay()
  if (!trashOpen) return null
  return <TrashView onClose={closeTrash} />
}

function AppShellChrome({ settings, children }: { settings: ReturnType<typeof useSettings>['settings'], children: ReactNode }) {
  useBackButton()
  const { isEditing } = useEditor()
  const { visible: keyboardVisible } = useKeyboard()
  const { requestSave, status } = useSaveStatus()
  const hideMobileShell = isEditing
  const hideTabBar = isEditing || keyboardVisible

  // Ctrl/Cmd+S：显式保存命令，替代 document.querySelector('[data-save-button]') 的 DOM hack
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        requestSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestSave])

  // 未保存时关闭标签页/刷新浏览器 → 原生确认
  useEffect(() => {
    if (status !== 'dirty') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // 外壳容器**不写底色**：chrome 的底色由 globals.css 的
  // `html:not(.tauri-mica) [data-menubar|data-sidebar|data-statusbar]` 给成 paper-alt，
  // Mica 下保持 transparent。在父级铺一层 bg 会把毛玻璃整个盖死（已踩过）。
  return (
    <div data-app-shell className="flex h-full min-h-0 flex-1 flex-col">
      <MenuBar />
      <VaultWriteBanner />
      {!hideMobileShell && <MobileTopBar />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        {/*
          内容区是一块「浮起来的纸」：圆角 + 一条边界线，与 chrome（顶栏 / 侧栏 / 底栏）分开。
          chrome 三块共用同一个底色、彼此之间不画线；**不额外加内外边距**，内容仍然贴到原来的位置。
          圆角取中档 6px（8px 在整窗尺寸上偏软，看着像被「包」住了）。
        */}
        <main className="min-w-0 flex-1 overflow-x-auto main-scroll bg-paper md:rounded-control md:border md:border-line">
          {children}
          <MobileTextSelectionBar />
        </main>
      </div>
      <StatusBar />
      {!hideTabBar && <MobileTabBar />}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("general")

  const openSettings = useCallback((tab?: string) => {
    setSettingsTab(tab ?? "general")
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  useEffect(() => {
    const v = getChromiumVersion()
    if (v) document.documentElement.dataset.chromiumVersion = String(v)
    if (isBelowTargetVersion()) document.documentElement.dataset.belowTargetVersion = 'true'
  }, [])

  // 移动端：HarmonyOS 检测 + 安全区域 polyfill
  useEffect(() => {
    void loadFieldConfig()
  }, [])

  useEffect(() => {
    if (!isMobilePlatform()) return
    const root = document.documentElement

    // HarmonyOS 标记
    if (isHarmonyOS()) {
      root.dataset.harmonyos = 'true'
      const version = getHarmonyOSVersion()
      if (version) root.dataset.harmonyosVersion = String(version)
    }

    // 安全区域回退：仅在 env() 确实返回 0 时才注入估算值
    // 不设强制兜底 — 否则会覆盖 env() 的正确值
    let fallbackActive = false
    let resizeCleanup: (() => void) | null = null

    const enableResizeListener = () => {
      if (resizeCleanup) return
      const onResize = () => {
        if (isSafeAreaEnvAvailable()) {
          // 模拟器修正模式：env() 非零但值不对，仅修正 bottom
          const correction = getSafeAreaBottomCorrection()
          if (correction !== null) {
            root.style.setProperty('--safe-bottom-estimated', `${correction}px`)
          }
        } else {
          // 完整 fallback 模式：env() 返回 0，重新估算 top + bottom
          const { top, bottom } = estimateSafeAreaInsets()
          if (top > 0) root.style.setProperty('--safe-top-estimated', `${top}px`)
          if (bottom > 0) root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
        }
      }
      window.addEventListener('resize', onResize)
      resizeCleanup = () => window.removeEventListener('resize', onResize)
    }

    const applyFallback = () => {
      if (fallbackActive) return
      const { top, bottom } = estimateSafeAreaInsets()
      if (top > 0) root.style.setProperty('--safe-top-estimated', `${top}px`)
      if (bottom > 0) root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
      root.dataset.safeAreaFallback = 'true'
      fallbackActive = true
      enableResizeListener()
    }

    const applyCorrection = (bottom: number) => {
      root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
      root.dataset.safeAreaFallback = 'true'
      fallbackActive = true
      enableResizeListener()
    }

    const check = () => {
      // 现代设备：env() 返回非零值，检查是否为模拟器异常（env 值偏离屏幕差值估算）
      if (isSafeAreaEnvAvailable()) {
        const correction = getSafeAreaBottomCorrection()
        if (correction !== null) {
          applyCorrection(correction)
        }
        return
      }
      // 兼容设备：env() 返回 0，启用完整 fallback
      applyFallback()
    }

    // 100ms / 500ms / 1s 三次检测，处理 env() 延迟返回的竞态
    const t1 = setTimeout(check, 100)
    const t2 = setTimeout(check, 500)
    const t3 = setTimeout(check, 1000)
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      if (resizeCleanup) resizeCleanup()
    }
  }, [])

  return (
    <GlobalContextMenu>
      <SettingsTriggerContext.Provider value={{ openSettings, closeSettings }}>
        <TrashOverlayProvider>
          <EditorProvider>
            <SaveStatusProvider>
              <MobileNavigationProvider>
                <MobilePageHeaderProvider>
                  <AppShellChrome settings={settings}>
                    {children}
                  </AppShellChrome>
                  <TrashOverlayRenderer />
                  <VaultSurfaces />
                  <DevMockBadge />
                </MobilePageHeaderProvider>
              </MobileNavigationProvider>
            </SaveStatusProvider>
          </EditorProvider>
        </TrashOverlayProvider>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      </SettingsTriggerContext.Provider>
    </GlobalContextMenu>
  )
}
/**
 * 浏览器预览标记。
 *
 * 桌面版永远绑定一个本地文件夹；浏览器里没有文件系统，走的是 Mock（数据只落在 IndexedDB）。
 * 这个标只在「开发时用浏览器看界面」时出现，提醒你现在改的东西不会落盘。
 */
function DevMockBadge() {
  const { supported } = useVault()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || supported) return null

  return (
    <div className="pointer-events-none fixed right-2 bottom-8 z-50 rounded-item bg-paper-card/80 px-1.5 py-0.5 text-[10px] text-ink-faint backdrop-blur">
      DEV · Mock（数据只在浏览器里）
    </div>
  )
}
