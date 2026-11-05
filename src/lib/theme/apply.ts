import { getThemePreset, type ThemePresetId, type ThemeTokens } from './presets'

/** 主题字段 → CSS 变量。这是「主题数据」落到界面上的唯一映射。 */
export const THEME_CSS_VARS: Record<keyof ThemeTokens, string> = {
  paper: '--oc-paper',
  paperAlt: '--oc-paper-alt',
  paperCard: '--oc-paper-card',
  line: '--oc-line',
  lineHover: '--oc-line-hover',
  ink: '--oc-ink',
  inkMuted: '--oc-ink-muted',
  inkFaint: '--oc-ink-faint',
  hover: '--oc-hover',
}

const TOKEN_KEYS = Object.keys(THEME_CSS_VARS) as (keyof ThemeTokens)[]

/**
 * 把官方主题落到 `<html>` 上。
 *
 * 走**行内变量**而不是增加一套 CSS 选择器：主题是数据（将来用户主题包也走这里），
 * 值不能写死在样式表里；行内变量天然压过 `.dark` 的默认值，亮暗切换时重落一遍即可。
 *
 * 调用点只有 `SettingsProvider`（主题模式变化 / 主题切换），别在组件里各调一次。
 */
export function applyThemePreset(id: ThemePresetId, isDark: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const preset = getThemePreset(id)
  const tokens = isDark ? preset.tokens.dark : preset.tokens.light

  root.setAttribute('data-palette', preset.id)
  for (const key of TOKEN_KEYS) {
    root.style.setProperty(THEME_CSS_VARS[key], tokens[key])
  }
}
