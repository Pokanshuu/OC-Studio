/**
 * 主题 = 插件（`kind: 'theme'`）。
 *
 * 为什么把主题算插件：它确实**扩展**了应用 —— 只是扩展的是「数据」而不是「逻辑」。
 * 相对功能插件，它的权限面是空的（没有代码可执行、没有数据可读），所以天然安全、
 * 可以先开放；但入口必须和功能插件放在一起，用户才不用记「主题算不算插件」。
 *
 * 一条规则：**默认全开**。主题是既有功能，把用户正在用的那套默认关掉会变成
 * 「升级完界面变了」；用户在设置里关掉某个主题，它才从选项里消失。
 */
import { THEME_PRESETS, isThemePresetId, type ThemePreset, type ThemePresetId } from '@/lib/theme/presets'
import { isPluginEnabled } from './store'
import type { PluginManifest } from './types'

/** 一套主题 = 一个插件；id 稳定，`theme.<主题 id>` */
export function themePluginId(presetId: ThemePresetId): string {
  return `theme.${presetId}`
}

export const THEME_PLUGINS: readonly PluginManifest[] = THEME_PRESETS.flatMap((preset) => {
  // `ThemePreset.id` 是宽松的 string（主题包将来可能带自定义 id），这里只认内置那四套
  if (!isThemePresetId(preset.id)) return []
  return [
    {
      id: themePluginId(preset.id),
      name: preset.name,
      kind: 'theme' as const,
      version: '1.0.0',
      apiVersion: 1,
      description: '一套配色',
      // 主题没有任何可执行代码，不需要权限（连自己的存储都不用）
      permissions: [],
      source: 'builtin' as const,
      enabledByDefault: true,
      available: true,
    },
  ]
})

/**
 * 个性化里能选的主题：只列「插件已启用」的那几套。
 *
 * `currentId` 永远保留 —— 用户关掉自己正在用的主题时，不能让他突然**没有选中项**，
 * 那会变成「界面颜色没变，但设置里什么都没选」的怪状态。
 */
export function enabledThemePresets(currentId?: ThemePresetId): ThemePreset[] {
  return THEME_PRESETS.filter((preset) => {
    if (preset.id === currentId) return true
    const plugin = THEME_PLUGINS.find((item) => item.id === `theme.${preset.id}`)
    return plugin === undefined || isPluginEnabled(plugin)
  })
}
