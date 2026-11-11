/**
 * Per-character blur-in for the block that is currently streaming.
 *
 * ### Why a rehype plugin
 *
 * react-markdown gives us hast; a *remark* plugin only sees markdown, where text
 * is still one string per node. To animate characters we have to replace those
 * text nodes with `<span>` elements **after** markdown parsing, which is exactly
 * what a rehype plugin is for.
 *
 * ### Why it does not re-animate old text
 *
 * The spans are rendered in document order as an append-only list. React
 * reconciles sibling lists by index, so a character keeps its DOM node when new
 * text is appended after it: the CSS animation already ran and does not restart.
 * Only genuinely new characters mount and animate — which is the whole effect.
 *
 * ### Cost ceiling
 *
 * `MAX_ANIMATED_CHARS` bounds how much of a block is turned into spans. Only the
 * tail block is ever passed through this plugin (see `MarkdownText`), and a block
 * longer than the cap falls back to plain text rather than creating thousands of
 * elements per frame.
 */

const MAX_ANIMATED_CHARS = 900

interface HastNode {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function characterSpan(char: string): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['ch'] },
    children: [{ type: 'text', value: char }],
  }
}

export function rehypeStreamChars() {
  return (tree: HastNode) => {
    /*
     * The cap is applied from the **head** on purpose.
     *
     * A sliding tail window would shift every span by one character on each
     * tick, i.e. ~900 text-node mutations 30×/second — measurable jank for no
     * visual gain. Wrapping from the head means appended characters simply
     * mount as new spans; once a block exceeds the cap its remaining text
     * streams as plain text (paragraphs are usually well under it).
     */
    let budget = MAX_ANIMATED_CHARS

    const walk = (node: HastNode, insideCode: boolean) => {
      const children = node.children
      if (!children) return

      const next: HastNode[] = []
      for (const child of children) {
        const isCode = insideCode || child.tagName === 'code' || child.tagName === 'pre'
        // KaTeX output must stay untouched: wrapping its glyphs in `.ch` spans
        // breaks the math layout (and the plugin runs after `rehype-katex`).
        const classes = child.properties?.className
        const isMath = Array.isArray(classes)
          ? classes.some((name) => name === 'katex' || name === 'math')
          : false

        if (child.type === 'text' && child.value && !isCode && !isMath) {
          for (const char of child.value) {
            // Whitespace stays as text: wrapping it only adds nodes and nothing
            // to look at.
            const plain = char === ' ' || char === '\n' || char === '\t'
            if (budget <= 0) {
              next.push({ type: 'text', value: char })
              continue
            }
            if (plain) {
              next.push({ type: 'text', value: char })
            } else {
              next.push(characterSpan(char))
              budget -= 1
            }
          }
          continue
        }

        if (child.children && !isMath) walk(child, isCode)
        next.push(child)
      }
      node.children = next
    }

    walk(tree, false)
  }
}
