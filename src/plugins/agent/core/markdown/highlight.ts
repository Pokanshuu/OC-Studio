/**
 * Syntax highlighting with **incremental** prefix reuse.
 *
 * ### The original problem
 *
 * While a fenced code block streams, its last line keeps changing. Highlighting
 * the whole block on every commit is wasted work: everything above the last line
 * is already final and its tokens cannot change (a token never *starts* on a
 * later line than the one it ends on — with the usual caveat about multi-line
 * strings, which is why the scheme is an optimisation, not a correctness
 * requirement).
 *
 * So: if the new code is a pure **append** of the previous code, keep every span
 * that ends before the last line and only re-tokenize from that line on. This is
 * the same trick the Android build used (`IncrementalHighlight`), reduced to a
 * single class with no caching library.
 *
 * ### Why spans and not an HTML string
 *
 * Spans render as real React elements — no `dangerouslySetInnerHTML`, no
 * sanitising, and offsets stay available for the "truncate to N lines while
 * collapsed" path.
 */

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import powershell from 'highlight.js/lib/languages/powershell'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGUAGES: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  powershell,
  rust,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
}

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition)
}

/** Aliases the models actually write in fences. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'python',
  sh: 'bash',
  zsh: 'bash',
  console: 'bash',
  'c++': 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  html: 'xml',
  htm: 'xml',
  vue: 'xml',
  svg: 'xml',
  htmlish: 'xml',
  yml: 'yaml',
  jsonc: 'json',
  json5: 'json',
  toml: 'ini',
  properties: 'ini',
  ps1: 'powershell',
  text: 'plaintext',
  txt: 'plaintext',
  plaintext: 'plaintext',
  md: 'markdown',
}

export function canonicalLanguage(language: string | null | undefined): string | null {
  if (!language) return null
  const key = language.trim().toLowerCase()
  if (!key) return null
  const mapped = ALIASES[key] ?? key
  return hljs.getLanguage(mapped) ? mapped : null
}

export interface HighlightSpan {
  start: number
  end: number
  /** highlight.js class name, e.g. `hljs-keyword`. */
  className: string
}

const HTML_TOKEN = /<span class="([^"]*)">|<\/span>|([^<]+)/g

/** highlight.js escapes exactly these; anything else passes through. */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Convert highlight.js HTML output into offset-annotated spans.
 *
 * highlight.js only ever emits `<span class="…">`, `</span>` and escaped text —
 * that is a small enough grammar to walk directly, and doing so keeps exact
 * offsets (needed by the incremental reuse and by line truncation).
 */
function spansFromHtml(html: string, offset: number): HighlightSpan[] {
  const spans: HighlightSpan[] = []
  const stack: string[] = []
  let position = offset

  HTML_TOKEN.lastIndex = 0
  for (let m = HTML_TOKEN.exec(html); m !== null; m = HTML_TOKEN.exec(html)) {
    if (m[1] !== undefined) {
      stack.push(m[1])
    } else if (m[2] !== undefined) {
      const text = decodeEntities(m[2])
      const start = position
      position += text.length
      const className = stack[stack.length - 1]
      if (className && text.length > 0) {
        const prev = spans[spans.length - 1]
        if (prev && prev.end === start && prev.className === className) {
          prev.end = position
        } else {
          spans.push({ start, end: position, className })
        }
      }
    } else {
      stack.pop()
    }
  }
  return spans
}

function compute(code: string, language: string | null, from: number): HighlightSpan[] {
  if (from >= code.length) return []
  const canonical = canonicalLanguage(language)
  if (!canonical) return []
  const slice = code.slice(from)
  try {
    const result = hljs.highlight(slice, { language: canonical, ignoreIllegals: true })
    return spansFromHtml(result.value, from)
  } catch {
    // A highlighter hiccup must never break rendering: fall back to plain text.
    return []
  }
}

/**
 * Incrementally highlighted code. Reuse one instance per code block (it lives in
 * a `useRef`), exactly like the Android version lived in `remember`.
 */
export class IncrementalHighlighter {
  private code = ''
  private language: string | null = null
  private spans: HighlightSpan[] = []

  spansFor(code: string, language: string | null): HighlightSpan[] {
    if (code === this.code && language === this.language) return this.spans

    let spans: HighlightSpan[]
    if (language !== this.language || !code.startsWith(this.code)) {
      // Not a pure append (new version / language change / edit): full pass.
      spans = compute(code, language, 0)
    } else {
      // Stable prefix = everything before the previous last line. That line may
      // still be growing into the appended text, so it is recomputed too.
      const from = this.code.lastIndexOf('\n') + 1
      const stable = this.spans.filter((s) => s.end <= from)
      spans = stable.concat(compute(code, language, from))
    }
    spans.sort((a, b) => a.start - b.start)

    this.code = code
    this.language = language
    this.spans = spans
    return spans
  }
}

export interface CodeSegment {
  text: string
  className?: string
}

/** Flatten `(code, spans)` into the render segments React actually needs. */
export function segmentsOf(code: string, spans: HighlightSpan[]): CodeSegment[] {
  if (spans.length === 0) return code.length ? [{ text: code }] : []
  const out: CodeSegment[] = []
  let cursor = 0
  for (const span of spans) {
    const start = Math.max(cursor, Math.min(span.start, code.length))
    const end = Math.max(start, Math.min(span.end, code.length))
    if (start > cursor) out.push({ text: code.slice(cursor, start) })
    if (end > start) out.push({ text: code.slice(start, end), className: span.className })
    cursor = end
  }
  if (cursor < code.length) out.push({ text: code.slice(cursor) })
  return out
}

/**
 * Cache of completed highlight results.
 *
 * Re-scrolling a long message, or the same snippet appearing twice, should not
 * re-tokenize. Keyed by language + code; cleared wholesale when full (simple,
 * and the rebuild cost is one tokenization).
 */
const CACHE_LIMIT = 128
const cache = new Map<string, HighlightSpan[]>()

export function highlightSpans(code: string, language: string | null): HighlightSpan[] {
  const key = `${language ?? ''}\u0000${code}`
  const hit = cache.get(key)
  if (hit) return hit

  const canonical = canonicalLanguage(language)
  const spans = canonical
    ? (() => {
        try {
          const result = hljs.highlight(code, { language: canonical, ignoreIllegals: true })
          return spansFromHtml(result.value, 0)
        } catch {
          return []
        }
      })()
    : []

  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, spans)
  return spans
}
