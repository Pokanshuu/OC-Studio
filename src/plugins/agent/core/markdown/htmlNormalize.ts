/**
 * Fold embedded HTML into **Markdown equivalents** so nothing is lost and no
 * tags leak into the text.
 *
 * ### Why
 *
 * Models emit HTML: `<br>`, `<b>`, `<div>`, `<details>`, `<a href>`. The
 * rendering chain (remark + react-markdown) has no component for raw HTML
 * blocks: block-level HTML disappears entirely and inline tags show up as
 * literal angle brackets. Users see "content missing" or "a pile of brackets".
 *
 * ### How
 *
 * Before the parser sees the text, translate those tags into constructs
 * Markdown already supports: headings, bold, italic, strikethrough, inline code,
 * quotes, lists, rules, links, images. Anything unrecognised is **stripped down
 * to its content** — losing a little formatting is always better than swallowing
 * words the user needs to read.
 *
 * ### Three places that must not be touched
 *
 * 1. inside fenced code blocks (that *is* the HTML source)
 * 2. inside backtick inline code (`` `<div>` `` is what should be displayed)
 * 3. autolinks `<https://…>` / `<a@b.com>` — they look like tags but are links
 */

const INLINE_CODE = /`[^`\n]*`/g

/** Reference definition `[id]: url "title"` (title optional, three quoting styles). */
const REF_DEF =
  /^\s*\[([^\]]+)\]:\s*(\S+?)\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))?\s*$/

/** Reference use `![alt][id]` / `[text][id]` / `[text][]` (collapsed form). */
const REF_USE = /(!?)\[([^\]]*)\]\[([^\]]*)\]/g

/** Markdown image `![alt](url)` — see {@link imageToMarkdown}. */
const MD_IMAGE = /!\[([^\]]*)\]\([^)]*\)/g

/** Named + numeric entities. */
const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});/g

const ANCHOR = /<\s*a\b((?:[^<>"']|"[^"]*"|'[^']*')*)>(.*?)<\s*\/\s*a\s*>/gis
const IMAGE = /<\s*img\b((?:[^<>"']|"[^"]*"|'[^']*')*)\/?>/gi
const TAG = /<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g
const AUTOLINK =
  /^<(?:[a-zA-Z][a-zA-Z0-9+.\-]*:[^<>\s]*|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/

/** Block-level tags that need a paragraph boundary. */
const BLOCK_TAGS = new Set([
  'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'figure', 'figcaption', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'tfoot',
  'pre', 'details', 'summary',
])

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export interface NormalizeHtmlOptions {
  /** Placeholder when an `<img>` has neither alt nor src. */
  imageAlt?: () => string
}

export function normalizeHtml(markdown: string, options: NormalizeHtmlOptions = {}): string {
  const imageAlt = options.imageAlt ?? (() => '图片')
  return collapseBlankLines(transformOutsideFences(resolveReferenceLinks(markdown), imageAlt))
}

/**
 * Inline **reference-style links**.
 *
 * This has to happen here because of block splitting: `[text][id]` and its
 * definition `[id]: https://… "title"` regularly land in *different* blocks, so
 * each block parsed alone cannot resolve the reference and falls back to the
 * literal `[text][id]`.
 */
export function resolveReferenceLinks(markdown: string): string {
  const defs = new Map<string, string>()
  const titles = new Map<string, string>()

  const normalized = markdown.replace(/\r\n?/g, '\n')
  for (const line of normalized.split('\n')) {
    const m = REF_DEF.exec(line)
    if (!m) continue
    const id = (m[1] ?? '').toLowerCase()
    defs.set(id, m[2] ?? '')
    const title = m[3] || m[4] || m[5] || ''
    if (title) titles.set(id, title)
  }
  if (defs.size === 0) return markdown

  const out: string[] = []
  let fenceMarker: string | null = null
  for (const line of normalized.split('\n')) {
    const marker = fenceMarkerOfLocal(line.replace(/^\s+/, ''))
    if (marker !== null) {
      if (fenceMarker === null) fenceMarker = marker
      else if (marker === fenceMarker) fenceMarker = null
      out.push(line)
      continue
    }
    if (fenceMarker === null && REF_DEF.test(line)) continue
    out.push(
      fenceMarker === null
        ? transformOutsideCode(line, (s) =>
            s.replace(REF_USE, (whole, bang: string, text: string, rawId: string) => {
              const id = (rawId || text).toLowerCase()
              const url = defs.get(id)
              if (url === undefined) return whole
              const label = text || titles.get(id) || url
              // Images keep only their text: the app never loads remote images.
              return bang ? label : `[${label}](${url})`
            }),
          )
        : line,
    )
  }
  return out.join('\n')
}

function fenceMarkerOfLocal(trimmed: string): string | null {
  if (trimmed.startsWith('```')) return '```'
  if (trimmed.startsWith('~~~')) return '~~~'
  return null
}

function transformOutsideFences(markdown: string, imageAlt: () => string): string {
  const out: string[] = []
  let fenceMarker: string | null = null
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = fenceMarkerOfLocal(line.replace(/^\s+/, ''))
    if (marker !== null) {
      if (fenceMarker === null) fenceMarker = marker
      else if (marker === fenceMarker) fenceMarker = null
      out.push(line)
      continue
    }
    out.push(
      fenceMarker === null
        ? transformOutsideCode(line, (s) => transformTags(s, imageAlt))
        : line,
    )
  }
  return out.join('\n')
}

/** Backtick spans are preserved verbatim; the rest goes through `transform`. */
function transformOutsideCode(text: string, transform: (s: string) => string): string {
  let out = ''
  let last = 0
  INLINE_CODE.lastIndex = 0
  for (let m = INLINE_CODE.exec(text); m !== null; m = INLINE_CODE.exec(text)) {
    if (m.index > last) out += transform(text.slice(last, m.index))
    out += m[0]
    last = m.index + m[0].length
  }
  if (last < text.length) out += transform(text.slice(last))
  return out
}

function transformTags(text: string, imageAlt: () => string): string {
  let s = text
  if (s.includes('![')) {
    s = s.replace(MD_IMAGE, (_whole, alt: string) => alt || imageAlt())
  }
  if (s.includes('<')) {
    s = s.replace(ANCHOR, (_whole, attrs: string, inner: string) => {
      const href = attr(attrs, 'href')
      if (!href) return inner
      const label = inner.trim() || href
      return `[${label}](${href})`
    })
    s = s.replace(IMAGE, (_whole, attrs: string) => {
      // Remote images are not loaded (see imageToMarkdown): keep the text only.
      const alt = attr(attrs, 'alt')
      if (alt && alt.trim()) return alt
      return attr(attrs, 'src') ?? imageAlt()
    })
    s = s.replace(TAG, (whole, slash: string, name: string, attrs: string) => {
      if (AUTOLINK.test(whole)) return whole
      return tagToMarkdown(slash, name, attrs)
    })
  }
  return s.includes('&') ? decodeEntities(s) : s
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity) => entityToChar(entity))
}

function entityToChar(entity: string): string {
  const body = entity.slice(1, -1)
  let ch: string | null = null
  if (/^#x/i.test(body)) {
    const code = parseInt(body.slice(2), 16)
    ch = Number.isFinite(code) ? String.fromCodePoint(code) : null
  } else if (body.startsWith('#')) {
    const code = parseInt(body.slice(1), 10)
    ch = Number.isFinite(code) ? String.fromCodePoint(code) : null
  } else {
    ch = ENTITY_MAP[body.toLowerCase()] ?? null
  }
  if (ch === null) return entity
  // Restored `<` / `>` would be read as HTML tags by the parser, so escape them.
  if (ch === '<') return '\\<'
  if (ch === '>') return '\\>'
  return ch
}

/** Reads an attribute value; a value-less attribute (`disabled`) yields `''`. */
function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = re.exec(attrs)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? ''
}

function tagToMarkdown(slash: string, name: string, attrs: string): string {
  const closing = slash.length > 0
  const tag = name.toLowerCase()

  let result: string
  switch (tag) {
    case 'br':
      result = '  \n'
      break
    case 'hr':
      result = '\n\n---\n\n'
      break
    case 'p':
      result = '\n\n'
      break
    case 'li':
      result = closing ? '\n' : '- '
      break
    case 'blockquote':
      result = closing ? '\n\n' : '\n\n> '
      break
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1])
      result = closing ? '\n\n' : `\n\n${'#'.repeat(level)} `
      break
    }
    case 'strong':
    case 'b':
      result = '**'
      break
    case 'em':
    case 'i':
    case 'cite':
    case 'var':
      result = '*'
      break
    case 'del':
    case 's':
    case 'strike':
      result = '~~'
      break
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt':
      result = '`'
      break
    default:
      result = BLOCK_TAGS.has(tag) ? '\n' : ''
  }

  // A self-closing tag (`<div/>`) must not leave the "closing" half missing.
  if (!closing && attrs.trim().endsWith('/') && result && result !== '- ') {
    if (/^(p|blockquote|h[1-6])$/.test(tag)) return `${result}\n\n`
    if (BLOCK_TAGS.has(tag) || tag === 'li') return `${result}\n`
  }
  return result
}

/** Collapse consecutive blank lines outside fences (tag folding leaves `\n\n\n`). */
function collapseBlankLines(text: string): string {
  const out: string[] = []
  let fenceMarker: string | null = null
  let blank = false
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = fenceMarkerOfLocal(line.replace(/^\s+/, ''))
    if (marker !== null) {
      if (fenceMarker === null) fenceMarker = marker
      else if (marker === fenceMarker) fenceMarker = null
      out.push(line)
      blank = false
      continue
    }
    if (fenceMarker === null && line.trim() === '') {
      if (blank) continue
      blank = true
      out.push('')
    } else {
      blank = false
      out.push(line)
    }
  }
  return out.join('\n')
}
