/**
 * 官方主题对比度自检：`npx tsx scripts/theme-presets-check.ts`
 *
 * `docs/主题.md` §6 要求导入主题时算对比度；内置主题先替自己算一遍。
 * 只查**正文可读性**，不追求 AAA 全面达标：
 * - 墨色 / 纸色、墨色 / 卡片 ≥ 7（正文）
 * - 次级文字 / 纸色、卡片 ≥ 4.5（说明文字）
 * - 辅助文字 / 纸色 ≥ 2.2（占位 / 弱提示：设计令牌本来就压在 3:1 以下，
 *   这里只保证「不比默认主题更糊」，不假装它是正文）
 * - 线 / 纸色 ≥ 1.15（能看见的分隔线，不参与文字对比）
 */
import { THEME_PRESETS, normalizeThemePreset, type ThemeTokens } from '../src/lib/theme/presets'

function channel(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`不是 6 位十六进制颜色：${hex}`)
  const n = parseInt(match[1], 16)
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

interface Check {
  label: string
  from: keyof ThemeTokens
  to: keyof ThemeTokens
  min: number
}

const CHECKS: Check[] = [
  { label: '墨色 / 纸色', from: 'ink', to: 'paper', min: 7 },
  { label: '墨色 / 卡片', from: 'ink', to: 'paperCard', min: 7 },
  { label: '次级文字 / 纸色', from: 'inkMuted', to: 'paper', min: 4.5 },
  { label: '次级文字 / 卡片', from: 'inkMuted', to: 'paperCard', min: 4.5 },
  { label: '辅助文字 / 纸色', from: 'inkFaint', to: 'paper', min: 2.2 },
  { label: '分隔线 / 纸色', from: 'line', to: 'paper', min: 1.15 },
  { label: '强调线 / 纸色', from: 'lineHover', to: 'paper', min: 1.3 },
]

const failures: string[] = []
const seen = new Set<string>()

for (const preset of THEME_PRESETS) {
  if (seen.has(preset.id)) failures.push(`主题 id 重复：${preset.id}`)
  seen.add(preset.id)
  if (preset.scope !== 'app') failures.push(`${preset.name}：v1 只做应用级主题`)

  if (preset.preview.paper !== preset.tokens.light.paper) {
    failures.push(`${preset.name}：预览纸色与亮色纸色不一致`)
  }
  if (preset.preview.ink !== preset.tokens.light.ink) {
    failures.push(`${preset.name}：预览墨色与亮色墨色不一致`)
  }

  for (const mode of ['light', 'dark'] as const) {
    const tokens = preset.tokens[mode]
    for (const check of CHECKS) {
      let ratio: number
      try {
        ratio = contrast(tokens[check.from], tokens[check.to])
      } catch (error) {
        failures.push(`${preset.name} · ${mode}：${(error as Error).message}`)
        continue
      }
      if (ratio < check.min) {
        failures.push(
          `${preset.name} · ${mode} · ${check.label}：${ratio.toFixed(2)}:1（要求 ≥ ${check.min}:1）`,
        )
      }
    }
  }
}

if (failures.length > 0) {
  console.error('官方主题自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

// 坏值 / 旧值必须回默认，不能让界面落进「有 data-palette、没令牌」的状态
if (normalizeThemePreset('nope') !== 'paper') failures.push('非法主题 id 没有回落到纸白')
if (normalizeThemePreset(undefined) !== 'paper') failures.push('缺失主题 id 没有回落到纸白')
if (normalizeThemePreset('pine') !== 'pine') failures.push('合法主题 id 被错误改写')

if (failures.length > 0) {
  console.error('官方主题自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`官方主题自检通过：${THEME_PRESETS.length} 套（${THEME_PRESETS.map((p) => p.name).join(' / ')}），亮暗各 ${CHECKS.length} 项对比度`)
