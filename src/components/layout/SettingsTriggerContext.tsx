"use client"

import { createContext, useContext } from "react"

/** 设置 › 世界 里的二级页面；从别处跳进来时用它直接落到对应面板。
 *  「主题」「关系图操作」在个性化页，不从这里跳。 */
export type SettingsSection = 'components' | 'templates' | 'categories' | 'tags'

interface SettingsTriggerContextValue {
  /** `target`：二级页里的具体对象（目前用于模板 id，直接打开某套模板） */
  openSettings: (tab?: string, section?: SettingsSection, target?: string) => void
  closeSettings: () => void
}

export const SettingsTriggerContext = createContext<SettingsTriggerContextValue>({
  openSettings: () => {},
  closeSettings: () => {},
})

export function useSettingsTrigger(): SettingsTriggerContextValue {
  return useContext(SettingsTriggerContext)
}
