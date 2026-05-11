"use client"

import { useState, useCallback, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { MenuBar } from "@/components/layout/MenuBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { Toaster } from "@/components/shared/toaster"
import { GlobalContextMenu } from "@/components/shared/GlobalContextMenu"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { SettingsTriggerContext } from "@/components/layout/SettingsTriggerContext"
import { useSettings } from "@/lib/settings"

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
    requestIdleCallback(() => {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
      try {
        const enabled = localStorage.getItem('blur-effect-enabled') === 'true'
        const isDark = document.documentElement.classList.contains('dark')
        invoke<boolean>('init_blur', { enabled, isDark })
          .then((applied) => {
            document.documentElement.classList.toggle('tauri-mica', applied)
          })
          .catch(() => {})
      } catch { /* 非 Tauri 环境静默跳过 */ }
    })
  }, [])

  return (
    <SettingsTriggerContext.Provider value={{ openSettings, closeSettings }}>
      <MenuBar />
      <div className="flex flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        <main className="flex-1 overflow-y-auto overflow-x-auto main-scroll bg-paper dark:bg-[#1C1B1A]">
          <GlobalContextMenu>{children}</GlobalContextMenu>
        </main>
      </div>
      <StatusBar />
      <Toaster />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
      />
    </SettingsTriggerContext.Provider>
  )
}
