"use client"

import { useState, useCallback, type ReactNode } from "react"
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

  return (
    <SettingsTriggerContext.Provider value={{ openSettings, closeSettings }}>
      <MenuBar />
      <div className="flex flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        <main className="flex-1 overflow-y-auto overflow-x-auto main-scroll">
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
