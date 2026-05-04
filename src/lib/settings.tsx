"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"

const STORAGE_KEY = "oc-studio-settings"

export interface Settings {
  theme: "light" | "dark" | "auto"
  autoDarkMode: boolean
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
    const root = document.documentElement
    const applyTheme = () => {
      if (settings.autoDarkMode) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        root.classList.toggle("dark", prefersDark)
      } else {
        root.classList.toggle("dark", settings.theme === "dark")
      }
    }
    applyTheme()

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (settings.autoDarkMode) applyTheme()
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [settings.theme, settings.autoDarkMode])

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        saveSettings(next)
        return next
      })
    },
    [],
  )

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}
