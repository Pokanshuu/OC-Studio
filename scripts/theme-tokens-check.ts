/**
 * 主题令牌归属自检：`npx tsx scripts/theme-tokens-check.ts`
 *
 * 双向校验：
 * 1. `globals.css` 里出现的每个 `--oc-*` 都必须在 `src/lib/theme-tokens.ts` 登记
 * 2. 登记表里不能有 CSS 里已经不存在的令牌（防止改名后留下幽灵条目）
 * 另外检查：亮暗两套是否成对（暗色可以只覆盖部分，但必须是有意的）
 */
import { readFileSync } from 'node:fs'
import { NON_THEME_TOKEN_PATTERN, THEME_TOKENS } from '../src/lib/theme-tokens'

const css = readFileSync('src/app/globals.css', 'utf8')
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
const darkBlock = /\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

function tokensIn(block: string): string[] {
  const names = new Set<string>()
  const re = /(--[a-z0-9-]+)\s*:/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block)) !== null) {
    if (match[1].startsWith('--oc') && !NON_THEME_TOKEN_PATTERN.test(match[1])) names.add(match[1])
  }
  return [...names].sort()
}

const light = tokensIn(rootBlock)
const dark = tokensIn(darkBlock)
const registered = new Set(THEME_TOKENS.map((token) => token.name))

const failures: string[] = []
const unregistered = light.filter((name) => !registered.has(name))
if (unregistered.length > 0) failures.push(`未登记归属：${unregistered.join(', ')}`)

const ghost = THEME_TOKENS.filter((token) => !light.includes(token.name)).map((token) => token.name)
if (ghost.length > 0) failures.push(`登记表里多出的令牌：${ghost.join(', ')}`)

// 暗色覆盖是「按需」的，但每一条都必须有亮色同名的基底
const darkWithoutLight = dark.filter((name) => !light.includes(name))
if (darkWithoutLight.length > 0) failures.push(`暗色覆盖了亮色没有的令牌：${darkWithoutLight.join(', ')}`)

// 归属只有三种
const badScope = THEME_TOKENS.filter((token) => !['shell', 'page', 'both'].includes(token.scope))
if (badScope.length > 0) failures.push(`非法归属：${badScope.map((t) => t.name).join(', ')}`)

if (failures.length > 0) {
  console.error('主题令牌自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

const byScope = (scope: string) => THEME_TOKENS.filter((token) => token.scope === scope).length
console.log(
  `主题令牌自检通过：${THEME_TOKENS.length} 个令牌（shell ${byScope('shell')} · page ${byScope('page')} · both ${byScope('both')}），亮色 ${light.length} 个、暗色覆盖 ${dark.length} 个`,
)
