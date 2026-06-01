"use client"

import { useState, useCallback, useEffect, type ReactNode } from "react"
import { MenuBar } from "@/components/layout/MenuBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { MobileTopBar } from "@/components/layout/MobileTopBar"
import { MobileTabBar } from "@/components/layout/MobileTabBar"
import { Toaster } from "@/components/shared/toaster"
import { GlobalContextMenu } from "@/components/shared/GlobalContextMenu"
import { MobileTextSelectionBar } from "@/components/shared/MobileTextSelectionBar"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { SettingsTriggerContext } from "@/components/layout/SettingsTriggerContext"
import { EditorProvider, useEditor } from "@/components/layout/EditorContext"
import { MobileNavigationProvider } from "@/components/layout/MobileNavigationContext"
import { TrashOverlayProvider, useTrashOverlay } from "@/components/layout/TrashOverlayContext"
import { MobilePageHeaderProvider } from "@/components/layout/MobilePageHeaderContext"
import { TrashView } from "@/features/trash/components/TrashView"
import { useSettings } from "@/lib/settings"
import { useKeyboard } from "@/lib/KeyboardContext"
import { useBackButton } from "@/lib/useBackButton"
import { getChromiumVersion, isHarmonyOS, getHarmonyOSVersion, isSafeAreaEnvAvailable, estimateSafeAreaInsets, getSafeAreaBottomCorrection, isMobilePlatform } from "@/lib/browser-compat"

function TrashOverlayRenderer() {
  const { trashOpen, closeTrash } = useTrashOverlay()
  if (!trashOpen) return null
  return <TrashView onClose={closeTrash} />
}

function AppShellChrome({ settings, children }: { settings: ReturnType<typeof useSettings>['settings'], children: ReactNode }) {
  useBackButton()
  const { isEditing } = useEditor()
  const { visible: keyboardVisible } = useKeyboard()
  const hideMobileShell = isEditing
  const hideTabBar = isEditing || keyboardVisible

  return (
    <>
      <MenuBar />
      {!hideMobileShell && <MobileTopBar />}
      <div className="flex flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        <main className="flex-1 overflow-x-auto main-scroll bg-paper dark:bg-[#1C1B1A]">
          <GlobalContextMenu>{children}</GlobalContextMenu>
          <MobileTextSelectionBar />
        </main>
      </div>
      <StatusBar />
      {!hideTabBar && <MobileTabBar />}
    </>
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const saveButton = document.querySelector('[data-save-button]') as HTMLButtonElement | null
        if (saveButton && !saveButton.disabled) {
          saveButton.click()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const v = getChromiumVersion()
    if (v) document.documentElement.dataset.chromiumVersion = String(v)
  }, [])

  // 移动端：HarmonyOS 检测 + 安全区域 polyfill
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

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    const init = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const enabled = localStorage.getItem('blur-effect-enabled') === 'true'
        const isDark = document.documentElement.classList.contains('dark')
        invoke<boolean>('init_blur', { enabled, isDark })
          .then((applied) => {
            document.documentElement.classList.toggle('tauri-mica', applied)
          })
          .catch(() => {})
      } catch { /* 非 Tauri 环境静默跳过 */ }
    }
    requestIdleCallback(() => { void init() })
  }, [])

  return (
    <SettingsTriggerContext.Provider value={{ openSettings, closeSettings }}>
      <TrashOverlayProvider>
        <EditorProvider>
          <MobileNavigationProvider>
            <MobilePageHeaderProvider>
              <AppShellChrome settings={settings}>
                {children}
              </AppShellChrome>
              <TrashOverlayRenderer />
            </MobilePageHeaderProvider>
          </MobileNavigationProvider>
        </EditorProvider>
      </TrashOverlayProvider>
      <Toaster />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
      />
    </SettingsTriggerContext.Provider>
  )
}
