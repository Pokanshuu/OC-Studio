/**
 * 把插件自带的样式表收进一个作用域根，避免泄进宿主。
 *
 * 用法：node scripts/scope-plugin-css.mjs <输入.css> <输出.css> [作用域选择器]
 *
 * 规则：
 * - 普通规则的选择器逐个前缀作用域根（逗号分隔的每一段都加）
 * - `:root` / `html` / `body` 改写作用域根本身（根上的变量与盒模型要落在包装层上）
 * - `[data-theme=…]` 这种属性选择器紧贴作用域根（包装层自己带 `data-theme`）
 * - `@media` / `@supports` / `@container` 进入内部继续前缀（它们只是条件壳）
 * - `@keyframes` / `@font-face` / `@property` / `@page` 整体跳过，里面的
 *   `0% { … }` 不是选择器，加前缀会把动画打死
 * - 注释先剥掉再解析，否则注释里的 `:` 会被当成选择器
 *
 * 这个脚本只跑一次，产物提交进仓库；上游更新时重跑即可。
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [input, output, scope = '.oc-agent-root'] = process.argv.slice(2)
if (!input || !output) {
  throw new Error('用法：node scope-plugin-css.mjs <输入.css> <输出.css> [作用域选择器]')
}

const SKIP_AT = /^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style)\b/
const ROOT_PARTS = new Set([':root', 'html', 'body', 'html,', '*'])

/** 把选择器列表里每一段加上作用域根 */
function scopeSelector(selector) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^(from|to|\d+(\.\d+)?%)$/.test(part)) return part
      if (part === ':root' || part === 'html' || part === 'body') return scope
      if (part.startsWith('[data-theme')) return `${scope}${part}`
      if (part === '*') return `${scope} *`
      return `${scope} ${part}`
    })
    .join(', ')
}

// 先剥注释：保留换行以免行号错乱
const source = readFileSync(input, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) =>
  m.replace(/[^\n]/g, ''),
)

/** @type {string[]} */
const out = []
let buffer = ''
let depth = 0
let inSkippedAt = false
let skipDepth = 0

for (let i = 0; i < source.length; i += 1) {
  const ch = source[i]

  if (ch === '{') {
    const head = buffer.trim()
    depth += 1

    if (head.startsWith('@')) {
      out.push(`${head}{`)
      if (SKIP_AT.test(head)) {
        inSkippedAt = true
        skipDepth = depth
      }
    } else if (inSkippedAt) {
      out.push(`${head}{`)
    } else if (!head) {
      out.push('{')
    } else {
      out.push(`${scopeSelector(head)}{`)
    }
    buffer = ''
    continue
  }

  if (ch === '}') {
    depth -= 1
    if (buffer.trim()) out.push(buffer.trim())
    out.push('}')
    buffer = ''
    if (inSkippedAt && depth < skipDepth) inSkippedAt = false
    continue
  }

  buffer += ch
}

if (buffer.trim()) out.push(buffer.trim())

const banner = `/* 由 scripts/scope-plugin-css.mjs 从插件源码生成，勿手改。作用域：${scope} */\n`
const body = out
  .join('\n')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
writeFileSync(output, `${banner}${body}\n`, 'utf8')

const leaked = out.filter((line) => !line.startsWith(scope) && !line.startsWith('@') && !line.startsWith('}') && !line.includes(':') && line.trim())
console.log(`已收进 ${scope}：${input} → ${output}；可疑未收编行 ${leaked.length}`)
