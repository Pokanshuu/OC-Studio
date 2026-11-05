/**
 * 主题令牌归属登记表（`docs/主题.md` §1.2）。
 *
 * 规矩：**每新增一个 `--oc-*` 令牌，必须在这里登记它属于哪一类**，否则
 * `scripts/theme-tokens-check.ts` 会报错。这不是形式主义 —— 页面级主题（「不同国家的角色
 * 不同背景」）只能改 `page` 令牌，碰不到 `shell`；靠的是分组，不是自觉。
 *
 * - `shell`  外壳：菜单栏 / 侧栏 / 状态栏的表面（应用级主题才能改）
 * - `page`   页面：纸色、墨色、线、悬停、遮罩、图表色（应用级 + 页面级都能改）
 * - `both`   两边都参与：危险色这类「语义色」，页面级可以覆盖应用级
 */

export type TokenScope = 'shell' | 'page' | 'both'

export interface TokenRegistration {
  name: string
  scope: TokenScope
  /** 一句话说明，出现在自检报告里 */
  note: string
}

export const THEME_TOKENS: readonly TokenRegistration[] = [
  { name: '--oc-paper', scope: 'page', note: '纸张底色（内容面）' },
  { name: '--oc-paper-alt', scope: 'page', note: '次级纸色（画布 / 侧栏内容）' },
  { name: '--oc-paper-card', scope: 'page', note: '卡片底色' },
  { name: '--oc-line', scope: 'page', note: '分隔线 / 描边' },
  { name: '--oc-line-hover', scope: 'page', note: '线在悬停 / 强调时的加深' },
  { name: '--oc-ink', scope: 'page', note: '正文墨色' },
  { name: '--oc-ink-muted', scope: 'page', note: '次级文字' },
  { name: '--oc-ink-faint', scope: 'page', note: '辅助文字 / 占位' },
  { name: '--oc-ink-fixed', scope: 'page', note: '固定底色上的墨色（不随主题翻转）' },
  { name: '--oc-paper-fixed', scope: 'page', note: '固定底色（不随主题翻转）' },
  { name: '--oc-hover', scope: 'page', note: '控件悬停 / 抬起的浅底' },
  { name: '--oc-scrim', scope: 'page', note: '弹窗遮罩' },
  { name: '--oc-shadow-float', scope: 'page', note: '浮层唯一一档阴影' },
  { name: '--oc-error-light', scope: 'page', note: '错误态浅底' },
  { name: '--oc-error', scope: 'both', note: '错误态文字 / 细线' },
  { name: '--oc-warning', scope: 'both', note: '待确认 / 正在进行' },
  { name: '--oc-success', scope: 'both', note: '成功态（低饱和）' },
  { name: '--oc-danger', scope: 'both', note: '破坏性确认底色（灰调红）' },
  { name: '--oc-danger-hover', scope: 'both', note: '破坏性确认悬停' },
  { name: '--oc-danger-ink', scope: 'both', note: '破坏性确认上的文字' },
  ...Array.from({ length: 12 }, (_, index) => ({
    name: `--oc-accent-${index + 1}`,
    scope: 'page' as const,
    note: `图表强调色第 ${index + 1} 档（关系图连线等，见 docs/主题.md §4）`,
  })),
]

/** 不属于主题的令牌（布局 / 动效 / 安全区），自检时跳过 */
export const NON_THEME_TOKEN_PATTERN = /^--(safe-|dur-|ease-)/

export function tokenScope(name: string): TokenScope | undefined {
  return THEME_TOKENS.find((token) => token.name === name)?.scope
}
