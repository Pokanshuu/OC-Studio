import { JSON_SCHEMA, load } from 'js-yaml'

// ── frontmatter 读写 ────────────────────────────────────────────────────
// 读：用 js-yaml 解析（JSON_SCHEMA，避免 `date: 2026-06-04` 被解析成 Date 对象）。
// 写：**不做整体重排**，只替换我们拥有的键的那几行，其余字节原样保留。
//     理由：vault 里的 frontmatter 是手工/AI 精修的，用 js-yaml 整体 dump
//     会把键顺序、引号风格、行内数组全部改写，产生巨大且无意义的 diff。

const DELIM = '---'

export interface ParsedFrontmatter {
  data: Record<string, unknown>
  /** frontmatter 之后的正文 */
  body: string
  /** 原文 frontmatter 块（不含首尾定界行），无 frontmatter 时为 null */
  raw: string | null
  /** 解析失败原因；成功为 null */
  error: string | null
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** 把源码切成 ['\n' 分隔的行] 并记录换行风格，写回时保持一致 */
interface SourceLines {
  lines: string[]
  eol: '\n' | '\r\n'
  bom: boolean
}

function splitSource(source: string): SourceLines {
  const bom = source.charCodeAt(0) === 0xfeff
  const text = stripBom(source)
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n'
  return { lines: text.split(/\r?\n/), eol, bom }
}

/** 定位 frontmatter 块；无则返回 null。start/end 均为行号（end 是结束定界行） */
function locateBlock(lines: string[]): { start: number; end: number } | null {
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start++
  if (start >= lines.length || lines[start].trim() !== DELIM) return null
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) return { start, end: i }
  }
  return null
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const { lines } = splitSource(source)
  const block = locateBlock(lines)
  if (!block) {
    return { data: {}, body: stripBom(source), raw: null, error: null }
  }

  const raw = lines.slice(block.start + 1, block.end).join('\n')
  const tail = lines.slice(block.end + 1)
  // 约定上 frontmatter 与正文之间恰好一个空行；只吃掉那一行，不多吃
  if (tail.length > 0 && tail[0].trim() === '') tail.shift()
  const body = tail.join('\n')

  let data: Record<string, unknown> = {}
  let error: string | null = null
  if (raw.trim() !== '') {
    try {
      const parsed = load(raw, { schema: JSON_SCHEMA })
      if (parsed === null || parsed === undefined) {
        data = {}
      } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>
      } else {
        error = 'frontmatter 顶层不是键值对'
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  return { data, body, raw, error }
}

/** frontmatter 顶层键的出现顺序 */
export function frontmatterKeys(source: string): string[] {
  const { lines } = splitSource(source)
  const block = locateBlock(lines)
  if (!block) return []
  const keys: string[] = []
  for (let i = block.start + 1; i < block.end; i++) {
    const key = topLevelKey(lines[i])
    if (key !== null) keys.push(key)
  }
  return keys
}

/** 该行是否为顶层键行；是则返回键名（不含冒号） */
function topLevelKey(line: string): string | null {
  if (line === '' || /^\s/.test(line) || line.trimStart().startsWith('#')) return null
  const m = /^([^:#][^:]*?)\s*:(?:\s|$)/.exec(line)
  return m ? m[1] : null
}

/** 顶层键 → [起始行, 结束行) 的行号范围 */
interface KeySpan {
  key: string
  from: number
  to: number
}

function keySpans(lines: string[], block: { start: number; end: number }): KeySpan[] {
  const spans: KeySpan[] = []
  for (let i = block.start + 1; i < block.end; i++) {
    const key = topLevelKey(lines[i])
    if (key === null) continue
    const prev = spans[spans.length - 1]
    if (prev) prev.to = i
    spans.push({ key, from: i, to: block.end })
  }
  // 修剪每个键尾部空行，让空行归属「键之间」而不是键本身
  for (const span of spans) {
    while (span.to > span.from + 1 && lines[span.to - 1].trim() === '') span.to--
  }
  return spans
}

/**
 * 只更新指定键，返回新源码。
 * - 值为 undefined / null → 删除该键
 * - 键不存在 → 追加到 frontmatter 末尾（无 frontmatter 则新建一块）
 * - 其余行（含键顺序、注释、空行）保持原样
 */
export function setFrontmatterKeys(
  source: string,
  updates: Record<string, unknown>,
): string {
  const { lines, eol, bom } = splitSource(source)
  const block = locateBlock(lines)
  const entries = Object.entries(updates)
  const prefix = bom ? '\ufeff' : ''

  if (!block) {
    // 没有 frontmatter 且没有任何有效更新 → 原样返回。
    // 否则空文件会被塞进一个空的 `---\n---` 块（用户根本没写过 frontmatter）。
    const effective = entries.filter(([, value]) => value !== undefined && value !== null)
    if (effective.length === 0) return prefix + lines.join(eol)

    const emitted: string[] = [DELIM]
    for (const [key, value] of effective) {
      emitted.push(...emitKey(key, value))
    }
    emitted.push(DELIM, '')
    return prefix + emitted.join(eol) + eol + lines.join(eol)
  }

  // 从后往前替换，避免行号漂移
  const spans = keySpans(lines, block)
  const result = [...lines]
  const handled = new Set<string>()

  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]
    if (!(span.key in updates)) continue
    const value = updates[span.key]
    handled.add(span.key)
    const replacement = value === undefined || value === null ? [] : emitKey(span.key, value)
    result.splice(span.from, span.to - span.from, ...replacement)
  }

  const appended: string[] = []
  for (const [key, value] of entries) {
    if (handled.has(key)) continue
    if (value === undefined || value === null) continue
    appended.push(...emitKey(key, value))
  }

  if (appended.length > 0) {
    // 重新定位结束定界行（前面的 splice 可能改变了行数）
    let end = -1
    for (let i = 1; i < result.length; i++) {
      if (result[i].trim() === DELIM) { end = i; break }
    }
    result.splice(end, 0, ...appended)
  }

  return prefix + result.join(eol)
}

/**
 * 只替换正文，frontmatter 原样保留（含键顺序与注释）。
 * 与 `setFrontmatterKeys` 配对使用：一个管属性，一个管正文。
 *
 * 关键细节：**沿用原文件在 frontmatter 之后有没有空行**。
 * 实测同一个 vault 里两种排版都有（有的文件有空行、有的没有），
 * 一律补一个空行就等于把用户 44 个文件的排版改掉了。
 */
export function setBody(source: string, body: string): string {
  const { lines, eol, bom } = splitSource(source)
  const prefix = bom ? '\ufeff' : ''
  const block = locateBlock(lines)

  if (block === null) {
    // 没有 frontmatter：整份内容就是正文
    return prefix + body
  }

  const head = lines.slice(0, block.end + 1)
  const hadBlank = block.end + 1 < lines.length && lines[block.end + 1].trim() === ''
  const separator = hadBlank ? [''] : []
  const tail = body === '' ? [] : [...separator, ...body.split(/\r?\n/)]
  return prefix + [...head, ...tail].join(eol)
}

/** 生成一个键的 YAML 行（可多行） */function emitKey(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`]
    const lines: string[] = [`${key}:`]
    for (const item of value) {
      lines.push(...emitSequenceItem(item))
    }
    return lines
  }
  return [`${key}: ${emitScalar(value)}`]
}

function emitSequenceItem(item: unknown): string[] {
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    const props = Object.entries(item as Record<string, unknown>)
    if (props.length === 0) return ['  - {}']
    const lines: string[] = []
    props.forEach(([key, value], index) => {
      const head = index === 0 ? '  - ' : '    '
      if (Array.isArray(value)) {
        lines.push(`${head}${key}:`)
        for (const sub of value) lines.push(`      - ${emitScalar(sub)}`)
      } else {
        lines.push(`${head}${key}: ${emitScalar(value)}`)
      }
    })
    return lines
  }
  return [`  - ${emitScalar(item)}`]
}

/** 标量 → YAML 字面量。只在必要时加引号，尽量保持可读的裸值风格 */
export function emitScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  const text = String(value)
  return needsQuote(text) ? JSON.stringify(text) : text
}

/** 会与 YAML 语法或类型推断冲突的裸标量需要加引号 */
function needsQuote(text: string): boolean {
  if (text === '') return true
  if (/^[\s]|\s$/.test(text)) return true
  // 多行：裸标量会被 YAML 读成折叠标量，直接破坏结构 —— 用 JSON.stringify 的双引号转义
  if (/[\r\n]/.test(text)) return true
  // 会被 YAML 推断成别的类型
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(text)) return true
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return true
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return true
  // 语法定界符 / 指示符开头
  if (/^[,[\]{}#&*!|>'"%@`?-]/.test(text)) return true
  // 行内出现「: 」或「 #」会被误读
  if (/:\s/.test(text) || /\s#/.test(text)) return true
  return false
}
