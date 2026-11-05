"use client"

import { createContext, useContext } from "react"

/** 设置 › 世界 里的二级页面；从别处跳进来时用它直接落到对应面板 */
export type SettingsSection = 'components' | 'templates' | 'categories' | 'tags'

interface SettingsTriggerContextValue {
  openSettings: (tab?: string, section?: SettingsSection) => void
  closeSettings: () => void
}

export const SettingsTriggerContext = createContext<SettingsTriggerContextValue>({
  openSettings: () => {},
  closeSettings: () => {},
})

export function useSettingsTrigger(): SettingsTriggerContextValue {
  return useContext(SettingsTriggerContext)
}
