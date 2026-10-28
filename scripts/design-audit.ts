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
    test: /\brounded\b(?!-)/,
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
]

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

function allowed(file: string): boolean {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  return LITERAL_ALLOWLIST.some((prefix) => rel.startsWith(prefix))
}

const violations: Violation[] = []

for (const file of walk(SRC)) {
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

console.log(`设计令牌体检：${violations.length} 处违规\n`)
for (const rule of RULES) {
  const list = byRule.get(rule.name)
  if (list === undefined) continue
  console.log(`✗ ${rule.name}（${list.length}）—— ${rule.why}`)
  for (const v of list) console.log(`    ${v.file}:${v.line}  ${v.text}`)
  console.log('')
}
process.exit(1)
