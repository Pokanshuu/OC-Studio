/**
 * 官方主题（v1：只换颜色，见 `docs/主题.md` §1.3）。
 *
 * **官方主题 = 内置的自定义主题**：这里的一份 `ThemePreset` 与将来用户导入的
 * `theme.json` 是同一份数据结构，不另写一套实现。v1 只开放 `page` 令牌，
 * `shell`（菜单栏 / 侧栏 / 状态栏）与结构（侧栏位置、卡片化）不在换的范围里。
 *
 * 每个主题必须同时给出亮暗两套：切换「主题（亮 / 暗 / 自动）」时，
 * `applyThemePreset()` 会按当前模式重新落一遍变量，而不是让亮色值漏进暗色。
 *
 * 颜色字面量是**主题数据**，不是界面样式 —— 与标签色板同理，已在
 * `scripts/design-audit.ts` 的白名单里登记。
 */

export type ThemeScope = 'app' | 'page'

/** `page` 层可换的令牌（变量名到值一一对应，见 `apply.ts`）。 */
export interface ThemeTokens {
  paper: string
  paperAlt: string
  paperCard: string
  line: string
  lineHover: string
  ink: string
  inkMuted: string
  inkFaint: string
  /** 控件悬停 / 抬起的浅底，带透明度 */
  hover: string
}

export interface ThemePreset {
  id: string
  name: string
  scope: ThemeScope
  tokens: { light: ThemeTokens; dark: ThemeTokens }
  /** 选择器上的两枚色点：纸色与墨色（不写进 CSS，只在 UI 里当示意） */
  preview: { paper: string; ink: string }
}

const PAPER: ThemePreset = {
  id: 'paper',
  name: '纸白',
  scope: 'app',
  preview: { paper: '#FEFCF8', ink: '#2B2B2B' },
  tokens: {
    light: {
      paper: '#FEFCF8',
      paperAlt: '#FAF7F2',
      paperCard: '#F3EFE9',
      line: '#E7E3DC',
      lineHover: '#D6D0C4',
      ink: '#2B2B2B',
      inkMuted: '#6E6A63',
      inkFaint: '#A5A098',
      hover: 'rgba(43, 43, 43, 0.045)',
    },
    dark: {
      paper: '#1C1B1A',
      paperAlt: '#242321',
      paperCard: '#2D2B28',
      line: '#38352F',
      lineHover: '#4A4642',
      ink: '#E3DFD8',
      inkMuted: '#A5A098',
      inkFaint: '#6E6A63',
      hover: 'rgba(227, 223, 216, 0.06)',
    },
  },
}

const LINEN: ThemePreset = {
  id: 'linen',
  name: '亚麻',
  scope: 'app',
  preview: { paper: '#FBF6EA', ink: '#2F2A20' },
  tokens: {
    light: {
      paper: '#FBF6EA',
      paperAlt: '#F6F0E1',
      paperCard: '#EFE7D4',
      line: '#E4DAC5',
      lineHover: '#D2C5AB',
      ink: '#2F2A20',
      inkMuted: '#6C6353',
      inkFaint: '#A29884',
      hover: 'rgba(47, 42, 32, 0.045)',
    },
    dark: {
      paper: '#1F1B15',
      paperAlt: '#27221B',
      paperCard: '#302A21',
      line: '#3D362B',
      lineHover: '#514738',
      ink: '#E8E0D2',
      inkMuted: '#ACA18E',
      inkFaint: '#6F6656',
      hover: 'rgba(232, 224, 210, 0.06)',
    },
  },
}

const PINE: ThemePreset = {
  id: 'pine',
  name: '松烟',
  scope: 'app',
  preview: { paper: '#F7F9F7', ink: '#232A26' },
  tokens: {
    light: {
      paper: '#F7F9F7',
      paperAlt: '#F1F4F1',
      paperCard: '#E8EDE8',
      line: '#DBE3DB',
      lineHover: '#C5D1C5',
      ink: '#232A26',
      inkMuted: '#5D6A63',
      inkFaint: '#97A49C',
      hover: 'rgba(35, 42, 38, 0.045)',
    },
    dark: {
      paper: '#161B18',
      paperAlt: '#1D2420',
      paperCard: '#25302A',
      line: '#2F3B34',
      lineHover: '#43534A',
      ink: '#DDE6E0',
      inkMuted: '#9EACA4',
      inkFaint: '#66756D',
      hover: 'rgba(221, 230, 224, 0.06)',
    },
  },
}

const CELADON: ThemePreset = {
  id: 'celadon',
  name: '青瓷',
  scope: 'app',
  preview: { paper: '#F6F8FA', ink: '#222B33' },
  tokens: {
    light: {
      paper: '#F6F8FA',
      paperAlt: '#EFF3F6',
      paperCard: '#E6ECF1',
      line: '#D8E2E9',
      lineHover: '#BFCFDA',
      ink: '#222B33',
      inkMuted: '#5B6A75',
      inkFaint: '#94A2AD',
      hover: 'rgba(34, 43, 51, 0.045)',
    },
    dark: {
      paper: '#171B1F',
      paperAlt: '#1D2328',
      paperCard: '#242C33',
      line: '#2F3942',
      lineHover: '#43515C',
      ink: '#DFE6EB',
      inkMuted: '#9DAAB4',
      inkFaint: '#64727C',
      hover: 'rgba(223, 230, 235, 0.06)',
    },
  },
}

/** 默认主题排第一（设置里的选项顺序）。 */
export const THEME_PRESETS: readonly ThemePreset[] = [PAPER, LINEN, PINE, CELADON]

export type ThemePresetId = 'paper' | 'linen' | 'pine' | 'celadon'

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === 'string' && THEME_PRESETS.some((preset) => preset.id === value)
}

/** 旧值 / 手改 localStorage 的非法值一律回默认，不让界面落进没有令牌的状态。 */
export function normalizeThemePreset(value: unknown): ThemePresetId {
  return isThemePresetId(value) ? value : 'paper'
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? PAPER
}
