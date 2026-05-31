"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"

const STORAGE_KEY = "oc-studio-settings"

export interface Settings {
  theme: "light" | "dark" | "auto"
  autoDarkMode: boolean
  aiEnabled: boolean
  apiKey: string
  aiModel: string
  aiBaseUrl: string
  cloudSyncEnabled: boolean
  syncServerUrl: string
  autoStart: boolean
  editMode: boolean
  sidebarVisible: boolean
}

const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  autoDarkMode: false,
  aiEnabled: false,
  apiKey: "",
  aiModel: "gpt-4o",
  aiBaseUrl: "",
  cloudSyncEnabled: false,
  syncServerUrl: "",
  autoStart: false,
  editMode: true,
  sidebarVisible: true,
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      return { ...DEFAULT_SETTINGS, ...parsed }
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

      if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
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
