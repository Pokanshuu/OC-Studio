/**
 * Split a whole Markdown document into "blocks that can be rendered on their
 * own".
 *
 * ### Why it exists
 *
 * The cost of streaming Markdown is not "how often do we commit" but **every
 * commit re-parses the entire document**. `Markdown(content = wholeText)` re-runs
 * the whole AST as soon as one character changes — a 5 000-character reply gets
 * fully re-parsed dozens of times while streaming, each time re-flowing every
 * paragraph. That is where the dropped frames come from.
 *
 * Once split, **completed blocks never change again**, so a memoised block
 * component skips them entirely; only the tail block follows the tokens. Parse
 * cost drops from O(document) to O(tail block).
 *
 * This is really "element-level rendering" approximated: ideally each Markdown
 * element type would be its own component. We cannot change the parser, but we
 * *can* change the granularity we feed it — one block, one parse.
 *
 * ### Division of labour with {@link normalizeSoftBreaks}
 *
 * Normalize first (bare newlines become blank lines), then split on **blank
 * lines**. Both rules must agree: wherever normalize refuses to insert a blank
 * line (fences, tables, indented continuations), splitting must refuse too —
 * otherwise the same content gets torn into two different shapes.
 */

export interface MarkdownBlock {
  /** Offset in the (already normalised) source. Also the stable key. */
  start: number
  /** A verbatim substring of the source — nothing added, nothing removed. */
  text: string
}

/** Monotonic id generator so `memo` keys stay strings (and cheap to compare). */
export function blockKey(block: MarkdownBlock): string {
  return `blk:${block.start}`
}

/**
 * Rules:
 *
 * 1. A **blank line** is a boundary — unless we are inside a fenced code block.
 * 2. Inside a fence (``` / ~~~) we **never** split: an unclosed fence swallows
 *    the rest into one block, which is exactly what a half-written code block
 *    should look like.
 * 3. Adjacent blocks of the **same family** (list↔list, table↔table) are merged
 *    back, so a loose list (`- a\n\n- b`) is not rendered as two lists that both
 *    restart at 1.
 *
 * O(n) in characters.
 */
export function splitMarkdownBlocks(source: string): MarkdownBlock[] {
  if (source.length === 0) return []

  const lines = source.split('\n')
  // Start offset of every line, to map "line range" back to "character range".
  const lineStart = new Array<number>(lines.length)
  let acc = 0
  for (let i = 0; i < lines.length; i++) {
    lineStart[i] = acc
    acc += lines[i].length + 1
  }

  const substringOf = (fromLine: number, toLineExclusive: number): string | null => {
    if (toLineExclusive <= fromLine) return null
    const start = lineStart[fromLine]
    const end =
      toLineExclusive >= lines.length
        ? source.length
        : lineStart[toLineExclusive] - 1 // drop the trailing '\n'
    const text = source.slice(start, end)
    return text.trim() === '' ? null : text
  }

  const blocks: MarkdownBlock[] = []
  let fence: string | null = null
  let blockStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^\s+/, '')
    const marker = fenceMarkerOfLocal(trimmed)
    if (marker !== null) {
      if (fence === null) fence = marker
      else if (marker === fence) fence = null
      // Mismatched marker (``` containing ~~~) is code content: state unchanged.
    }
    if (fence !== null) continue // never split inside a fence
    if (lines[i].trim() === '') {
      const text = substringOf(blockStartLine, i)
      if (text !== null) blocks.push({ start: lineStart[blockStartLine], text })
      blockStartLine = i + 1
    }
  }
  const tail = substringOf(blockStartLine, lines.length)
  if (tail !== null) blocks.push({ start: lineStart[blockStartLine], text: tail })

  return mergeSameFamily(blocks, source)
}

function fenceMarkerOfLocal(trimmed: string): string | null {
  if (trimmed.startsWith('```')) return '```'
  if (trimmed.startsWith('~~~')) return '~~~'
  return null
}

/**
 * Merge adjacent same-family blocks (loose lists / tables).
 *
 * The merged text is the **contiguous source range** `source[prev.start, cur.end)`,
 * so it still adds and removes nothing. The blank lines in between stay inside
 * the block text, which is exactly how a loose list is supposed to look.
 */
function mergeSameFamily(blocks: MarkdownBlock[], source: string): MarkdownBlock[] {
  if (blocks.length < 2) return blocks
  const out: MarkdownBlock[] = []
  for (const b of blocks) {
    const prev = out[out.length - 1]
    if (prev && sameFamily(prev.text, b.text)) {
      const end = Math.min(b.start + b.text.length, source.length)
      out[out.length - 1] = { start: prev.start, text: source.slice(prev.start, end) }
    } else {
      out.push(b)
    }
  }
  return out
}

function sameFamily(a: string, b: string): boolean {
  const fa = firstMeaningfulLine(a)
  const fb = firstMeaningfulLine(b)
  return (
    (isListMarker(fa) && isListMarker(fb)) || (isTableRow(fa) && isTableRow(fb))
  )
}

function firstMeaningfulLine(text: string): string {
  for (const line of text.split('\n')) {
    if (line.trim() !== '') return line.replace(/^\s+/, '')
  }
  return ''
}

function isListMarker(trimmedLine: string): boolean {
  if (trimmedLine.length === 0) return false
  if (trimmedLine.length >= 2 && '-*+'.includes(trimmedLine[0]) && trimmedLine[1] === ' ') {
    return true
  }
  // Ordered: `1.` / `12)` …
  const dot = trimmedLine.search(/[.)]/)
  if (dot < 1 || dot > 9) return false
  const head = trimmedLine.slice(0, dot)
  return /^\d+$/.test(head)
}

function isTableRow(trimmedLine: string): boolean {
  return trimmedLine.startsWith('|')
}
