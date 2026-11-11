/**
 * 设计令牌体检 —— 全项目扫一遍「没走令牌」的写法。
 *
 * 用法：`npx tsx scripts/design-audit.ts`
 * 退出码：有违规 = 1，干净 = 0（可以直接挂到 CI / 提交前跑）。
 *
 * 只查**界面代码**（src 下的 ts/tsx）：数据文件里的颜色、导出站的样式表、
 * 标签色板这些是「内容」不是「界面」，在白名单里。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

interface Violation {
  rule: string
  file: string
  line: number
  text: string
}

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

/** 允许出现字面量的文件（内容是数据，不是界面） */
const LITERAL_ALLOWLIST = [
  'src/lib/tag-colors.ts',
  'src/lib/seed/',
  'src/lib/export/site/styles.ts',
  'src/types/index.ts',
  // 标签色是用户数据：必须有完整字面量类名，Tailwind JIT 不能拼接（见 TagBadge 顶部注释）
  'src/features/tags/components/TagBadge.tsx',
  'src/features/tags/components/TagPicker.tsx',
  // 地图渲染色板：画布写像素（ImageData）与 Canvas 填充，拿不到 CSS 变量；
  // 生物群系 / 高程 / 政区色属于「图上内容」，不是界面样式（见 docs/地图.md）
  'src/plugins/map-generator/types.ts',
  'src/plugins/map-generator/political.ts',
  // 实体强调色：要在色值后面拼透明度（`#RRGGBB24`），`var()` 拼不了，所以存的是字面量。
  // 它和标签色同一性质（内容色），换主题时不需要跟着变
  'src/lib/entity-accent.ts',
  // 封面取色：从封面图里抽出来的色调（内容色，随图片变），不是界面样式
  'src/lib/cover/',
  // 官方主题内置包：一份 theme.json 等价物的颜色字面量（主题数据，不是界面样式），
  // 与标签色 / 地图色板同理；运行时由 applyThemePreset() 落到 CSS 变量
  'src/lib/theme/presets.ts',
]

interface Rule {
  name: string
  /** 说明，出现在报告里 */
  why: string
  test: RegExp
}

const RULES: Rule[] = [
  {
    name: 'radius-literal',
    why: '像素圆角 → 用 rounded-item(4) / control(6) / panel(8)',
    test: /rounded-\[/,
  },
  {
    name: 'radius-retired',
    why: '圆角只剩三档：media → rounded-item、menu → rounded-control',
    test: /\brounded-(media|menu)\b/,
  },
  {
    name: 'prose-prefix',
    why: '文案节制：不写「注：/说明：/提示：」这种散文前缀，要让布局解释（见设计文档 §9）',
    test: />\s*(注|说明|提示|备注)[：:]/,
  },
  {
    name: 'radius-legacy',
    why: 'shadcn 派生圆角 → 用语义名',
    test: /\brounded-(sm|md|lg|xl|2xl|3xl|4xl)\b/,
  },
  {
    name: 'radius-bare',
    why: '裸 rounded(4px) → 用语义名',
    // 只看「类名形态」：`rounded` 后紧跟 `=` / `>` 的是变量或 JSX 表达式，
    // 不是类名（`const rounded = 0` / `${rounded > 0}` 都被误伤过）。
    test: /\brounded\b(?!-)(?!\s*[=>])/,
  },
  {
    name: 'palette-color',
    why: 'Tailwind 原色 → 用设计令牌（error/warning/ink/paper…）',
    test: /\b(bg|text|border|ring|divide|from|via|to)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
  },
  {
    name: 'raw-hex',
    why: '颜色字面量 → 用令牌（用户数据的颜色除外，见文件级白名单）',
    test: /#[0-9A-Fa-f]{3,8}\b/,
  },
  {
    name: 'dark-hex',
    why: '暗色十六进制覆盖 → 令牌本身已经跟主题走',
    test: /dark:(bg|text|border|ring|divide)-\[#/,
  },
  {
    name: 'black-white-surface',
    why: '黑/白半透明当底色 → bg-[var(--oc-hover)]',
    test: /bg-black\/\d+ dark:bg-white\/\d+/,
  },
  {
    name: 'scrim-literal',
    why: '弹窗/抽屉遮罩只有一档 → bg-[var(--oc-scrim)]（值 = 旧的 bg-black/15 dark:bg-black/40）',
    // 只逮「亮暗成对」的那串弹窗遮罩；图片 hover、全屏查看那种深色遮罩另属一类，不在此列
    test: /bg-black\/15 dark:bg-black\/40/,
  },
  {
    name: 'shadow',
    why: '内容面零阴影；浮层只用唯一一档 → float-shadow（FLOAT_SHADOW）',
    test: /\bshadow-(xs|sm|md|lg|xl|2xl|inner)\b/,
  },
  {
    name: 'shadow-literal',
    why: '浮层阴影只有一档 → float-shadow（--oc-shadow-float），不要自己编阴影值',
    test: /shadow-\[/,
  },
  {
    name: 'border-fat',
    why: '线只有 1px（头像外圈那种装饰描边除外，用 border-2/4 需在此登记）',
    test: /\bborder-(?:\[(?:[2-9]|\d{2})px\]|[2-9])\b/,
  },
  {
    name: 'focus-ring',
    why: '不要 ring 光晕 → focus-visible 用令牌色描边或底色',
    test: /\bring-(?:[1-9]|\[)/,
  },
  {
    name: 'doc-reference',
    why: '界面文案里不写仓库路径 / 文档编号（「见 docs/todo.md §11」）—— 用户看不懂，文档还会改名',
    // 只逮字符串与 JSX 文本里的 docs/ 引用；注释在扫描前已被跳过
    test: /(?:^|[^a-zA-Z0-9_])docs\/[a-zA-Z0-9_\u4e00-\u9fa5-]+\.md/,
  },
]

/**
 * 整目录移植物不归这套规则管。
 *
 * `src/plugins/agent/` 原样搬自 Simple-Agent（`docs/插件.md` §0.0）：它的样式自带
 * 一套收在 `.oc-agent-root` 作用域里的 CSS，令牌名与色值和宿主一致，但代码由上游
 * 维护 —— 我们既不改它的类名，也就不该拿宿主的原子类规则去扫它的源码。
 */
const SKIP_DIRS = ['src/plugins/agent/']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

function skipped(file: string): boolean {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  return SKIP_DIRS.some((prefix) => rel.startsWith(prefix))
}

function allowed(file: string): boolean {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  return LITERAL_ALLOWLIST.some((prefix) => rel.startsWith(prefix))
}

const violations: Violation[] = []

for (const file of walk(SRC)) {
  if (skipped(file)) continue
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  let inBlockComment = false
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    // 块注释（含多行）整段跳过：文档里会举例写 `rounded-[6px]` 这种反面教材
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      return
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true
      return
    }
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return
    // 行内豁免：`// design-audit-allow 规则名` —— 必须在同一行写清理由
    const allowMatch = /design-audit-allow\s+([a-z-]+)/.exec(line)
    const allowRule = allowMatch?.[1]

    for (const rule of RULES) {
      if (!rule.test.test(line)) continue
      if (allowRule === rule.name) continue
      // 白名单文件里只跳过「颜色字面量」类规则
      if (allowed(rel) && (rule.name === 'palette-color' || rule.name === 'radius-legacy' || rule.name === 'raw-hex')) continue
      violations.push({ rule: rule.name, file: rel, line: index + 1, text: trimmed.slice(0, 120) })
    }
  })
}

const byRule = new Map<string, Violation[]>()
for (const v of violations) {
  const list = byRule.get(v.rule) ?? []
  list.push(v)
  byRule.set(v.rule, list)
}

// ── 重复片段报告（信息性，不算违规） ───────────────────────────────────
// 同一串长类名在 ≥3 个文件里重复出现 = 该收进 ui-tokens 了。
const fragments = new Map<string, Set<string>>()
for (const file of walk(SRC)) {
  if (skipped(file)) continue
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (rel.endsWith('ui-tokens.ts')) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/className=(?:\{`|")([^"`]{40,400})(?:`\}|")/g)) {
    const raw = match[1].trim()
    if (raw.includes('${')) continue
    const set = fragments.get(raw) ?? new Set<string>()
    set.add(rel)
    fragments.set(raw, set)
  }
}
/**
 * 移动端选词工具栏下发的编辑器事件，必须真有接收方。
 *
 * 这些命令靠**字符串事件名**连起来：`dispatchEditorEvent('mobile:insert-table')`
 * 派发一个 CustomEvent，`editor-mobile-events.ts` 里的表负责接。两边各自写名字，
 * 改一边忘另一边就变成「点了没反应」——而且只在手机上出现，桌面很难发现。
 *
 * 判定：派发的每个名字都要在 `editor-mobile-events.ts` 里出现。
 */
{
  const eventFiles: string[] = []
  const walkEvents = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        walkEvents(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name)) continue
      eventFiles.push(full)
    }
  }
  walkEvents(join(process.cwd(), 'src'))

  const bindings = readFileSync(join(process.cwd(), 'src/components/editor/editor-mobile-events.ts'), 'utf8')
  const missing = new Set<string>()
  for (const full of eventFiles) {
    const text = readFileSync(full, 'utf8')
    for (const match of text.matchAll(/dispatchEditorEvent\(\s*['"]([^'"]+)['"]/g)) {
      if (!bindings.includes(`'${match[1]}'`)) missing.add(match[1])
    }
  }

  for (const name of missing) {
    const violation = {
      rule: 'dead-editor-event',
      file: 'src/components/shared/mobile-text-selection/useMobileSelectionActions.tsx',
      line: 1,
      text: `事件 ${name} 有派发、没有接收方（editor-mobile-events.ts 里没有它）`,
    }
    violations.push(violation)
    byRule.set('dead-editor-event', [...(byRule.get('dead-editor-event') ?? []), violation])
  }
}

/**
 * 没有读者的设置项 = 骗人的开关。
 *
 * 事故形状：开机自启动的开关以前只写 localStorage、没人调系统接口，拨了没反应
 * （现在已改成灰掉的「开发中」）。同类问题还会再犯 —— 加一个设置字段、写个开关、
 * 忘了在别处消费它。这里对着 `Settings` 接口逐个查「设置页之外有没有人读」。
 *
 * 允许清单只放**已经明确不做**的项，并且必须在 UI 里是灰的：
 * - `autoStart`（开机自启）：桌面端要做 StartupTask，见 todo P3
 * - `cloudSyncEnabled` / `syncServerUrl`（云同步）：未上线，UI 已禁用
 */
{
  const NOT_IMPLEMENTED = new Set(['autoStart', 'cloudSyncEnabled', 'syncServerUrl'])
  const settingsText = readFileSync(join(process.cwd(), 'src/lib/settings.tsx'), 'utf8')
  const ifaceStart = settingsText.indexOf('export interface Settings')
  const ifaceEnd = settingsText.indexOf('}', ifaceStart)
  const iface = ifaceStart >= 0 ? settingsText.slice(ifaceStart, ifaceEnd) : ''
  const fields = [...iface.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1])

  const tsFiles: string[] = []
  const walkSettings = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        walkSettings(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const rel = full.replace(/\\/g, '/')
      // 设置页自己不算「读者」（它只是写值）；`lib/settings.tsx` 里的应用副作用算
      // —— 主题 / 背景图就是在 provider 的 effect 里生效的
      if (rel.includes('/components/settings/')) continue
      tsFiles.push(full)
    }
  }
  walkSettings(join(process.cwd(), 'src'))

  const sources = tsFiles.map((file) => readFileSync(file, 'utf8'))
  for (const field of fields) {
    if (NOT_IMPLEMENTED.has(field)) continue
    // 只认 `settings.<字段>` 这种**读取**形态：接口声明与默认值里是 `字段: 类型`，不会被算进来
    const used = sources.some((text) => text.includes(`settings.${field}`))
    if (used) continue
    const violation = {
      rule: 'dead-setting',
      file: 'src/lib/settings.tsx',
      line: 1,
      text: `设置项 ${field} 在设置页之外没有任何读者（要么接上，要么标成开发中）`,
    }
    violations.push(violation)
    byRule.set('dead-setting', [...(byRule.get('dead-setting') ?? []), violation])
  }
}

/**
 * 界面文案里别写 Markdown 星号。
 *
 * 事故形状（2026-11-12）：备份页脚注写成「导入时**只在目标还是空的**时恢复」，
 * 界面上原样显示两个星号。文档里能这么写，界面里不能 —— 用户看到的是乱码。
 *
 * 只扫「会渲染的文字」：跳过行注释、块注释与 JSX 注释，也跳过展开运算符之类的代码。
 */
{
  const offenders: Array<{ file: string; line: number; text: string }> = []
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules') continue
        walk(full)
      } else if (name.endsWith('.tsx')) {
        files.push(full)
      }
    }
  }
  walk(join(process.cwd(), 'src'))

  for (const full of files) {
    const rel = full.replace(/\\/g, '/').replace(join(process.cwd(), 'src').replace(/\\/g, '/') + '/', 'src/')
    const lines = readFileSync(full, 'utf8').split('\n')
    let inBlockComment = false
    let inJsxComment = false
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (inJsxComment) {
        if (trimmed.includes('*/}')) inJsxComment = false
        return
      }
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false
        return
      }
      if (trimmed.includes('{/*')) {
        if (!trimmed.includes('*/}')) inJsxComment = true
        return
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlockComment = true
        return
      }
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return
      const code = line.split('//')[0]
      if (!code.includes('**')) return
      if (code.includes('...')) return
      if (!/[\u4e00-\u9fa5]/.test(code)) return
      offenders.push({ file: rel, line: index + 1, text: trimmed.slice(0, 80) })
    })
  }

  for (const offender of offenders) {
    const violation = { rule: 'markdown-star', ...offender }
    violations.push(violation)
    byRule.set('markdown-star', [...(byRule.get('markdown-star') ?? []), violation])
  }
}

/**
 * 输入法（IME）守卫：这些输入框在**回车即提交**（新建 / 重命名），
 * 组字中的回车是「选候选词」——不拦就会把拼音（`xinyhijian`）建成实体名；
 * Esc 同理（取消组字 vs 关闭编辑）。文件里必须出现 `isImeComposing(`。
 *
 * 用「文件级存在」而不是正则匹配单行：守卫写在 `onKeyDown` 开头，
 * 与 `key === 'Enter'` 不在同一行的写法太多了，按行匹配全是误报。
 */
const IME_GUARDED_FILES = [
  'src/features/characters/components/NewFolderDialog.tsx',
  'src/features/characters/components/FolderManageDialog.tsx',
  'src/features/characters/components/CharacterFolderBar.tsx',
  'src/features/map/components/MapSwitcher.tsx',
  'src/features/map/components/MapDetailDialog.tsx',
  'src/components/settings/BasicInfoPanel.tsx',
  'src/components/settings/BodyPresetPanel.tsx',
  'src/components/settings/TemplatesPanel.tsx',
  'src/components/settings/FieldSettings.tsx',
]

for (const rel of IME_GUARDED_FILES) {
  const text = readFileSync(join(process.cwd(), rel), 'utf8')
  if (text.includes('isImeComposing(')) continue
  const violation = {
    rule: 'ime-guard',
    file: rel,
    line: 1,
    text: '回车即提交的输入框没有输入法守卫（isImeComposing）',
  }
  violations.push(violation)
  byRule.set('ime-guard', [...(byRule.get('ime-guard') ?? []), violation])
}

const repeated = [...fragments.entries()]
  .filter(([, files]) => files.size >= 3)
  .sort((a, b) => b[1].size - a[1].size)

if (violations.length === 0) {
  console.log('设计令牌体检：干净（0 处违规）')
  if (repeated.length > 0) {
    console.log(`\n可收进 ui-tokens 的重复片段（${repeated.length} 条，仅供整理，不算违规）：`)
    for (const [fragment, files] of repeated.slice(0, 12)) {
      console.log(`  ×${files.size}  ${fragment.slice(0, 90)}`)
    }
  }
  process.exit(0)
}

/** 规则名 → 一句「为什么」。正则规则自带 `why`，下面的自定义检查统一在这里登记。 */
const EXTRA_WHY: Record<string, string> = {
  'ime-guard': '回车即提交的输入框必须挡掉输入法组字中的回车 / Esc',
  'markdown-star': '界面文案里不写 Markdown 星号（`**`），用户看到的是乱码',
  'dead-setting': '设置项必须在设置页之外有读者，否则就是个拨了没反应的开关',
  'dead-editor-event': '移动端下发的编辑器事件必须有接收方，否则点了没反应',
}

console.log(`设计令牌体检：${violations.length} 处违规\n`)
// 按 byRule 打印（不按 RULES 遍历）：自定义检查（IME / Markdown / 死设置）不在 RULES 里
for (const [name, list] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const why = RULES.find((rule) => rule.name === name)?.why ?? EXTRA_WHY[name] ?? ''
  console.log(`✗ ${name}（${list.length}）${why ? `—— ${why}` : ''}`)
  for (const v of list) console.log(`    ${v.file}:${v.line}  ${v.text}`)
  console.log('')
}
process.exit(1)

