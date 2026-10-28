"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "./env"
import { DEFAULT_SIDEBAR_WIDTH, clampSidebarWidth } from "./sidebar-width"
import type { EditorLayout } from "./editor-layout"

const STORAGE_KEY = "oc-studio-settings"

export interface Settings {
  theme: "light" | "dark" | "auto"
  cloudSyncEnabled: boolean
  syncServerUrl: string
  autoStart: boolean
  sidebarVisible: boolean
  sidebarWidth: number
  /** 编辑界面样式；默认「自动」（≥1280 多栏，否则全屏） */
  editorLayout: EditorLayout
}

const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  cloudSyncEnabled: false,
  syncServerUrl: "",
  autoStart: false,
  sidebarVisible: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  editorLayout: "auto",
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      const merged = { ...DEFAULT_SETTINGS, ...parsed }
      return { ...merged, sidebarWidth: clampSidebarWidth(merged.sidebarWidth) }
    }
  } catch {
    // corrupted data, fall through
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // storage full or unavailable
  }
}

interface SettingsContextValue {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
})

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      const isDark = settings.theme === "auto" ? prefersDark : settings.theme === "dark"

      root.classList.toggle("dark", isDark)
      root.setAttribute("data-theme", isDark ? "dark" : "light")

      if (isTauri()) {
        try {
          const enabled = window.localStorage.getItem("blur-effect-enabled") === "true"
          invoke<boolean>("update_blur_effect", { enabled, isDark })
            .then((applied) => {
              root.classList.toggle("tauri-mica", applied)
            })
            .catch(() => {})
        } catch {}
      }
    }
    applyTheme()

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (settings.theme === "auto") applyTheme()
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [settings.theme])

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}
