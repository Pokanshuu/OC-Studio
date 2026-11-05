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

/**
 * 七色 —— 赤橙黄绿青蓝紫。
 *
 * 前四套（纸白 / 亚麻 / 松烟 / 青瓷）是**中性**的：没有色相，像不同的纸。
 * 这一组是有色相的：整块纸和墨都偏向同一个色相，但**彩度压得很低**（纸色
 * 在 L*≈97、彩度 3–6），读正文时还是纸，不是色块。
 *
 * 硬约束来自 `npm run audit:palettes`：墨/纸 ≥ 7:1、次级文字/纸 ≥ 4.5:1、
 * 辅助文字 ≥ 2.2:1、分隔线 ≥ 1.15:1。暗色不是把亮色反过来，是**同一色相压到
 * L*≈12 的纸 + L*≈88 的墨** —— 直接取反会得到刺眼的荧光色。
 */
const VERMILION: ThemePreset = {
  id: 'vermilion',
  name: '朱砂',
  scope: 'app',
  preview: { paper: '#FBF5F4', ink: '#2E2222' },
  tokens: {
    light: {
      paper: '#FBF5F4',
      paperAlt: '#F7EFEE',
      paperCard: '#F1E6E4',
      line: '#E9DAD8',
      lineHover: '#D8C2BF',
      ink: '#2E2222',
      inkMuted: '#6E5957',
      inkFaint: '#A69390',
      hover: 'rgba(46, 34, 34, 0.045)',
    },
    dark: {
      paper: '#1B1515',
      paperAlt: '#211A1A',
      paperCard: '#282020',
      line: '#332929',
      lineHover: '#473838',
      ink: '#ECE1E1',
      inkMuted: '#B5A3A3',
      inkFaint: '#7E6F6F',
      hover: 'rgba(236, 225, 225, 0.06)',
    },
  },
}

const AMBER: ThemePreset = {
  id: 'amber',
  name: '琥珀',
  scope: 'app',
  preview: { paper: '#FCF7F1', ink: '#2F2720' },
  tokens: {
    light: {
      paper: '#FCF7F1',
      paperAlt: '#F8F0E6',
      paperCard: '#F2E8DA',
      line: '#EADCC9',
      lineHover: '#D9C5A9',
      ink: '#2F2720',
      inkMuted: '#6F5F4E',
      inkFaint: '#A69884',
      hover: 'rgba(47, 39, 32, 0.045)',
    },
    dark: {
      paper: '#1B1713',
      paperAlt: '#211C17',
      paperCard: '#28221C',
      line: '#332B23',
      lineHover: '#473C2F',
      ink: '#EDE4D8',
      inkMuted: '#B6A896',
      inkFaint: '#7F7463',
      hover: 'rgba(237, 228, 216, 0.06)',
    },
  },
}

const REED: ThemePreset = {
  id: 'reed',
  name: '苇黄',
  scope: 'app',
  preview: { paper: '#FBF8EE', ink: '#2E2B1F' },
  tokens: {
    light: {
      paper: '#FBF8EE',
      paperAlt: '#F7F3E4',
      paperCard: '#F1ECD8',
      line: '#E9E2C8',
      lineHover: '#D8CFA9',
      ink: '#2E2B1F',
      inkMuted: '#6E6750',
      inkFaint: '#A69E84',
      hover: 'rgba(46, 43, 31, 0.045)',
    },
    dark: {
      paper: '#1A1813',
      paperAlt: '#201E18',
      paperCard: '#27241C',
      line: '#322E24',
      lineHover: '#464032',
      ink: '#ECE8D8',
      inkMuted: '#B4AE96',
      inkFaint: '#7D7863',
      hover: 'rgba(236, 232, 216, 0.06)',
    },
  },
}

const MOSS: ThemePreset = {
  id: 'moss',
  name: '苔绿',
  scope: 'app',
  preview: { paper: '#F5FAF5', ink: '#222E22' },
  tokens: {
    light: {
      paper: '#F5FAF5',
      paperAlt: '#EEF6EE',
      paperCard: '#E4F0E4',
      line: '#D6E6D6',
      lineHover: '#BCD8BC',
      ink: '#222E22',
      inkMuted: '#586C58',
      inkFaint: '#92A592',
      hover: 'rgba(34, 46, 34, 0.045)',
    },
    dark: {
      paper: '#141B14',
      paperAlt: '#192119',
      paperCard: '#1F281F',
      line: '#283328',
      lineHover: '#384738',
      ink: '#E1ECE1',
      inkMuted: '#A3B5A3',
      inkFaint: '#6E7F6E',
      hover: 'rgba(225, 236, 225, 0.06)',
    },
  },
}

const DEEP_SEA: ThemePreset = {
  id: 'deep-sea',
  name: '海青',
  scope: 'app',
  preview: { paper: '#F3FAFA', ink: '#1F2D2D' },
  tokens: {
    light: {
      paper: '#F3FAFA',
      paperAlt: '#EBF5F5',
      paperCard: '#E0EFEF',
      line: '#D1E6E6',
      lineHover: '#B6D6D6',
      ink: '#1F2D2D',
      inkMuted: '#556B6B',
      inkFaint: '#8EA4A4',
      hover: 'rgba(31, 45, 45, 0.045)',
    },
    dark: {
      paper: '#131B1B',
      paperAlt: '#182121',
      paperCard: '#1E2828',
      line: '#273333',
      lineHover: '#374747',
      ink: '#E1ECEC',
      inkMuted: '#A2B5B5',
      inkFaint: '#6D7F7F',
      hover: 'rgba(225, 236, 236, 0.06)',
    },
  },
}

const INDIGO: ThemePreset = {
  id: 'indigo',
  name: '靛蓝',
  scope: 'app',
  preview: { paper: '#F4F7FC', ink: '#202636' },
  tokens: {
    light: {
      paper: '#F4F7FC',
      paperAlt: '#ECF1F9',
      paperCard: '#E2E9F4',
      line: '#D4DDEF',
      lineHover: '#B9C6E2',
      ink: '#202636',
      inkMuted: '#576079',
      inkFaint: '#9099AE',
      hover: 'rgba(32, 38, 54, 0.045)',
    },
    dark: {
      paper: '#15181F',
      paperAlt: '#1A1E27',
      paperCard: '#20252F',
      line: '#292F3B',
      lineHover: '#3A4252',
      ink: '#E2E7F1',
      inkMuted: '#A5AEC2',
      inkFaint: '#707A8D',
      hover: 'rgba(226, 231, 241, 0.06)',
    },
  },
}

const VIOLET: ThemePreset = {
  id: 'violet',
  name: '紫苑',
  scope: 'app',
  preview: { paper: '#F8F4FB', ink: '#282133' },
  tokens: {
    light: {
      paper: '#F8F4FB',
      paperAlt: '#F2EDF8',
      paperCard: '#EBE3F3',
      line: '#DFD4EC',
      lineHover: '#CABADF',
      ink: '#282133',
      inkMuted: '#625776',
      inkFaint: '#9B90AC',
      hover: 'rgba(40, 33, 51, 0.045)',
    },
    dark: {
      paper: '#17141F',
      paperAlt: '#1D1927',
      paperCard: '#241F2F',
      line: '#2D273B',
      lineHover: '#3F3752',
      ink: '#E7E1F1',
      inkMuted: '#ADA3C2',
      inkFaint: '#776F8D',
      hover: 'rgba(231, 225, 241, 0.06)',
    },
  },
}

/** 默认主题排第一（设置里的选项顺序）。中性在前，七色在后。 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  PAPER,
  LINEN,
  PINE,
  CELADON,
  VERMILION,
  AMBER,
  REED,
  MOSS,
  DEEP_SEA,
  INDIGO,
  VIOLET,
]

export type ThemePresetId =
  | 'paper'
  | 'linen'
  | 'pine'
  | 'celadon'
  | 'vermilion'
  | 'amber'
  | 'reed'
  | 'moss'
  | 'deep-sea'
  | 'indigo'
  | 'violet'

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
