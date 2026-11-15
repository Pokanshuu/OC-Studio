/**
 * 字号字面量迁移（阶段 C · 一次性批量脚本，保留可重跑）
 *
 *   npx tsx scripts/migrate-font-sizes.ts            # 只报告（默认 --dry-run）
 *   npx tsx scripts/migrate-font-sizes.ts --apply    # 真改
 *
 * 只做**像素完全相等**的替换，渲染结果不许变一个像素：
 *
 *   text-[11px] → text-micro      text-xs (12px, line-height 1rem)   → text-caption + leading-4
 *   text-[12px] → text-caption    text-sm (14px, line-height 1.25rem) → text-body   + leading-5
 *   text-[13px] → text-ui
 *   text-[14px] → text-body
 *   text-[15px] → text-reading
 *
 * `text-xs` / `text-sm` 自带行高，而五档令牌（globals.css 的 `@theme`）**只定义字号、不定义行高**
 * —— 直接换会掉回继承行高，所以同一条 class 串里没有显式 `leading-*` 时补上原来的行高；
 * 带变体前缀的（`md:` / `max-md:`）补同一前缀的 leading，保证各断点行为不变。
 *
 * 不动的（列在报告里）：10px、12.5px、17/18/24/26/28px、`text-base/lg/xl/2xl`。
 * 只扫 `src/` 下的 .ts / .tsx（globals.css 里讲历史的那段注释不该被改写）。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const APPLY = process.argv.includes('--apply')

/** 等值字面量 → 五档 */
const EQUAL_LITERALS: Record<string, string> = {
  'text-[11px]': 'text-micro',
  'text-[12px]': 'text-caption',
  'text-[13px]': 'text-ui',
  'text-[14px]': 'text-body',
  'text-[15px]': 'text-reading',
}

/** Tailwind 自带档 → 五档（`text-xs` = 12px/1rem、`text-sm` = 14px/1.25rem） */
const EQUAL_TIERS: Record<string, { size: string; leading: string }> = {
  'text-xs': { size: 'text-caption', leading: 'leading-4' },
  'text-sm': { size: 'text-body', leading: 'leading-5' },
}

/** 变体链：`md:` / `max-md:` / `group-hover:` / `data-[open]:` … */
const VARIANT = '(?:[A-Za-z0-9_-]+(?:-\\[[^\\]]*\\])?:)*'
/** 类名边界：空白、引号、模板串插值、`{`（`className={...}`） */
const BOUNDARY = '[\\s"\'`{]'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
  return out
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function lineAt(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset) + 1
  const end = text.indexOf('\n', offset)
  return text.slice(start, end === -1 ? text.length : end)
}

/** 命中行里没有显式 `leading-*` 才需要补行高 */
function needsLeading(text: string, offset: number): boolean {
  return !/\bleading-/.test(lineAt(text, offset))
}

/** 等值字面量：只换尺寸，不动 variants */
function replaceLiterals(source: string): string {
  let text = source
  for (const [token, replacement] of Object.entries(EQUAL_LITERALS)) {
    const re = new RegExp(`(${BOUNDARY})(${VARIANT})${token.replace(/[[\]]/g, '\\$&')}(?![\\w\\[\\]-])`, 'g')
    text = text.replace(re, (match, boundary: string, variants: string, offset: number) => {
      if (isCommentLine(lineAt(text, offset))) return match
      return `${boundary}${variants}${replacement}`
    })
  }
  return text
}

/** `text-xs` / `text-sm`：换档 + 按需补同前缀行高 */
function replaceTiers(source: string): { text: string; leadingAdded: number } {
  let text = source
  let leadingAdded = 0
  for (const [token, { size, leading }] of Object.entries(EQUAL_TIERS)) {
    const re = new RegExp(`(${BOUNDARY})(${VARIANT})${token}(?![\\w-])`, 'g')
    text = text.replace(re, (match, boundary: string, variants: string, offset: number) => {
      if (isCommentLine(lineAt(text, offset))) return match
      if (needsLeading(text, offset)) {
        leadingAdded += 1
        return `${boundary}${variants}${size} ${variants}${leading}`
      }
      return `${boundary}${variants}${size}`
    })
  }
  return { text, leadingAdded }
}

function collect(pattern: RegExp, text: string, bucket: Record<string, number>): void {
  for (const match of text.matchAll(pattern)) {
    const key = match[1]
    bucket[key] = (bucket[key] ?? 0) + 1
  }
}

function walkText(bucket: Record<string, number>[], text: string): void {
  const [literal, tier] = bucket
  collect(/text-\[(\d+(?:\.\d+)?)px\]/g, text, literal)
  collect(/(?<![\w-])text-(xs|sm|base|lg|xl|2xl)\b/g, text, tier)
}

function main(): void {
  const files = walk(SRC)
  const before: Record<string, number>[] = [{}, {}]
  const after: Record<string, number>[] = [{}, {}]
  let literalReplaced = 0
  let tierReplaced = 0
  let leadingAdded = 0
  const locations = new Map<string, string[]>()
  const changed: string[] = []

  const sum = (record: Record<string, number>): number =>
    Object.values(record).reduce((total, value) => total + value, 0)

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    const fileBefore: Record<string, number>[] = [{}, {}]
    walkText(fileBefore, source)
    const tiers = replaceTiers(replaceLiterals(source))
    const next = tiers.text
    const fileAfter: Record<string, number>[] = [{}, {}]
    walkText(fileAfter, next)

    for (const [index, bucket] of fileBefore.entries()) {
      for (const [key, value] of Object.entries(bucket)) before[index][key] = (before[index][key] ?? 0) + value
    }
    walkText(after, next)

    literalReplaced += sum(fileBefore[0]) - sum(fileAfter[0])
    tierReplaced += sum(fileBefore[1]) - sum(fileAfter[1])
    leadingAdded += tiers.leadingAdded

    if (next !== source) {
      changed.push(rel)
      if (APPLY) writeFileSync(file, next, 'utf8')
    }

    // 剩余（不在五档里的）值的典型位置 —— 按迁移后的文本算
    next.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        const list = locations.get(`${match[1]}px`) ?? []
        if (list.length < 3) list.push(`${rel}:${index + 1}`)
        locations.set(`${match[1]}px`, list)
      }
      for (const match of line.matchAll(/(?<![\w-])text-(base|lg|xl|2xl)\b/g)) {
        const value = `text-${match[1]}`
        const list = locations.get(value) ?? []
        if (list.length < 3) list.push(`${rel}:${index + 1}`)
        locations.set(value, list)
      }
    })
  }

  const fmt = (record: Record<string, number>): string =>
    Object.entries(record)
      .sort((a, b) => Number.parseFloat(a[0]) - Number.parseFloat(b[0]) || a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}×${value}`)
      .join('  ') || '（无）'

  console.log(`${APPLY ? '已改写' : '试运行（加 --apply 才写文件）'}：${changed.length} 个文件\n`)
  console.log(`字号字面量  迁移前 ${fmt(before[0])}`)
  console.log(`            迁移后 ${fmt(after[0])}`)
  console.log(`Tailwind 档 迁移前 ${fmt(before[1])}`)
  console.log(`            迁移后 ${fmt(after[1])}`)
  console.log(`\n替换：字面量 ${literalReplaced} 处，text-xs/sm ${tierReplaced} 处，补行高 ${leadingAdded} 处`)

  if (locations.size > 0) {
    console.log('\n不动的（像素不等值，需人判断）：')
    for (const [value, filesAt] of [...locations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${value.padEnd(12)} ${filesAt.join('  ')}`)
    }
  }

  if (!APPLY && changed.length > 0) {
    console.log(`\n改动文件（前 15 个）：`)
    for (const rel of changed.slice(0, 15)) console.log(`  ${rel}`)
    if (changed.length > 15) console.log(`  …另有 ${changed.length - 15} 个`)
  }
}

main()
