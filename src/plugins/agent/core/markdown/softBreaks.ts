/**
 * Turn "bare single newlines" into blank lines — i.e. treat them as paragraph
 * boundaries.
 *
 * ### Why this exists
 *
 * In Markdown a single newline is a *soft* break: it renders as a space. In
 * Chinese prose a single newline very often **is** a paragraph break, and models
 * emit exactly that. Without this pass, several paragraphs collapse into one
 * unreadable wall of text.
 *
 * ### Why not "every single newline is a paragraph"
 *
 * Models know Markdown and use both forms:
 *
 * ```
 * First paragraph.<LF><LF>        ← blank line = paragraph separator
 * Sentence A.  <LF>               ← two trailing spaces = hard break inside a paragraph
 * Sentence B.<LF><LF>
 * ```
 *
 * So the decision depends on the **end of the line**: a line ending in a hard
 * break marker is a deliberate in-paragraph break and must be left alone. A
 * clean single newline is the "I meant to start a new paragraph but Markdown ate
 * it" case.
 *
 * ### Seven places that must not be touched
 *
 * 1. inside fenced code blocks (that would split the code)
 * 2. table rows (header and delimiter must stay adjacent)
 * 3. boundaries that are already blank
 * 4. lines ending with a hard-break marker (see above)
 * 5. indented continuation lines (list continuations, indented code)
 * 6. **sentence-internal punctuation** at the end of the line (`,`, `、`, `；`,
 *    `：`, opening quotes/brackets…) — the sentence is not finished yet. But a
 *    following line that starts a new block still forces a break.
 * 7. **adjacent quote lines** (`>`) — one quote block, not many.
 *
 * Kept as a pure function because five rules are easy to get subtly wrong and
 * the symptom ("some kinds of content render oddly") is impossible to eyeball.
 */

const CONTINUATION_PUNCTUATION = '，、；：,;:（(「『“‘《〈【〔'

/** The list marker pattern `- `, `* `, `+ `, `1. `, `12) `. */
const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s.*$/

/** Fence marker: ``` or ~~~. Shared with `htmlNormalize`. */
export function fenceMarkerOf(trimmed: string): string | null {
  if (trimmed.startsWith('```')) return '```'
  if (trimmed.startsWith('~~~')) return '~~~'
  return null
}

/**
 * Mirrors `Char.isWhitespace()` (Java/Kotlin) rather than JS `\s`:
 *
 * * JS `\s` counts U+00A0 / U+2007 / U+202F (no-break spaces) as whitespace, the
 *   JVM does not;
 * * both treat U+3000 (ideographic space) as whitespace, which matters here —
 *   Chinese text indents with it and a trailing U+3000 must still count as
 *   "sentence continues on the next line".
 */
export function isJavaWhitespace(code: number): boolean {
  if (code === 0x20 || (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x1f)) {
    return true
  }
  if (code === 0xa0 || code === 0x2007 || code === 0x202f) return false
  return (
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x205f ||
    code === 0x3000
  )
}

/** `String.isBlank()`: only whitespace (in the JVM sense) or empty. */
export function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!isJavaWhitespace(text.charCodeAt(i))) return false
  }
  return true
}

function endsWithHardBreak(line: string): boolean {
  return line.endsWith('  ') || line.endsWith('\\')
}

function endsWithContinuation(line: string): boolean {
  for (let i = line.length - 1; i >= 0; i--) {
    if (isJavaWhitespace(line.charCodeAt(i))) continue
    return CONTINUATION_PUNCTUATION.includes(line[i])
  }
  return false
}

function startsNewBlock(line: string): boolean {
  const t = line.replace(/^\s+/, '')
  return (
    t.startsWith('```') ||
    t.startsWith('~~~') ||
    t.startsWith('|') ||
    t.startsWith('#') ||
    t.startsWith('>') ||
    t.startsWith('---') ||
    t.startsWith('***') ||
    LIST_MARKER.test(t)
  )
}

function isTableRow(line: string): boolean {
  return line.replace(/^\s+/, '').startsWith('|')
}

function isQuoteLine(line: string): boolean {
  return line.replace(/^\s+/, '').startsWith('>')
}

function startsWithWhitespace(line: string | undefined): boolean {
  if (!line || line.length === 0) return false
  return isJavaWhitespace(line.charCodeAt(0))
}

export function normalizeSoftBreaks(markdown: string): string {
  // Kotlin's `lines()` treats \r\n, \r and \n alike; mirror that.
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []

  let fenceMarker: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const marker = fenceMarkerOf(line.replace(/^\s+/, ''))

    if (marker !== null) {
      if (fenceMarker === null) fenceMarker = marker
      else if (marker === fenceMarker) fenceMarker = null
      // A mismatched marker inside a fence is code content: state unchanged.
    }

    out.push(line)

    // The opening fence line and everything inside: never insert a blank line.
    if (fenceMarker !== null) continue

    const next = lines[i + 1]
    if (next === undefined) continue

    const keep =
      isBlank(line) || // 3
      isBlank(next) || // 3
      endsWithHardBreak(line) || // 4
      (endsWithContinuation(line) && !startsNewBlock(next)) || // 6
      isTableRow(line) || // 2
      (isQuoteLine(line) && isQuoteLine(next)) || // 7
      startsWithWhitespace(line) || // 5
      startsWithWhitespace(next) // 5

    if (keep) continue
    out.push('')
  }

  return out.join('\n')
}
