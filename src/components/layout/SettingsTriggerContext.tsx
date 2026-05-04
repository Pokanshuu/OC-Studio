"use client"

import { createContext, useContext } from "react"

interface SettingsTriggerContextValue {
  openSettings: (tab?: string) => void
  closeSettings: () => void
}

export const SettingsTriggerContext = createContext<SettingsTriggerContextValue>({
  openSettings: () => {},
  closeSettings: () => {},
})

export function useSettingsTrigger(): SettingsTriggerContextValue {
  return useContext(SettingsTriggerContext)
}
