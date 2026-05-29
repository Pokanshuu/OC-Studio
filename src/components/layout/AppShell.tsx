"use client"

import { useState, useCallback, useEffect, type ReactNode } from "react"
import { MenuBar } from "@/components/layout/MenuBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { MobileTopBar } from "@/components/layout/MobileTopBar"
import { MobileTabBar } from "@/components/layout/MobileTabBar"
import { Toaster } from "@/components/shared/toaster"
import { GlobalContextMenu } from "@/components/shared/GlobalContextMenu"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { SettingsTriggerContext } from "@/components/layout/SettingsTriggerContext"
import { EditorProvider, useEditor } from "@/components/layout/EditorContext"
import { MobileNavigationProvider } from "@/components/layout/MobileNavigationContext"
import { TrashOverlayProvider, useTrashOverlay } from "@/components/layout/TrashOverlayContext"
import { MobilePageHeaderProvider } from "@/components/layout/MobilePageHeaderContext"
import { TrashView } from "@/features/trash/components/TrashView"
import { useSettings } from "@/lib/settings"
import { useBackButton } from "@/lib/useBackButton"

function TrashOverlayRenderer() {
  const { trashOpen, closeTrash } = useTrashOverlay()
  if (!trashOpen) return null
  return <TrashView onClose={closeTrash} />
}

function AppShellChrome({ settings, children }: { settings: ReturnType<typeof useSettings>['settings'], children: ReactNode }) {
  useBackButton()
  const { isEditing } = useEditor()
  const hideMobileShell = isEditing

  return (
    <>
      <MenuBar />
      {!hideMobileShell && <MobileTopBar />}
      <div className="flex flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        <main className={`flex-1 overflow-x-auto main-scroll bg-paper dark:bg-[#1C1B1A] pb-[calc(60px+var(--safe-bottom))] md:pb-0 ${hideMobileShell ? '' : 'max-md:pt-[calc(60px+var(--safe-top))]'}`}>
          <GlobalContextMenu>{children}</GlobalContextMenu>
        </main>
      </div>
      <StatusBar />
      {!hideMobileShell && <MobileTabBar />}
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
