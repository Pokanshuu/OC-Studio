/**
 * One Markdown block.
 *
 * ⚠️ **The props are `{ text }` only — deliberately.**
 *
 * React skips work when props are referentially equal. Styles/colours/plugins
 * passed in as props are freshly built objects on every render, so the block
 * would re-parse and re-typeset on every streamed token, defeating the entire
 * point of block splitting. Everything else is read from CSS variables and
 * module-level constants instead, which leaves exactly one changing prop: the
 * tail block's `text`.
 */

import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { openUrl } from '@tauri-apps/plugin-opener'
import { remarkAlerts } from '@/plugins/agent/core/markdown/alerts'
import { rehypeStreamChars } from '@/plugins/agent/core/markdown/streamChars'
import { CodeBlock } from './CodeBlock'

// ── hast helpers ────────────────────────────────────────────────────────────

interface HastNode {
  type?: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function hastText(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  if (!node.children) return ''
  return node.children.map(hastText).join('')
}

function languageOf(node: HastNode | undefined): string | null {
  const className = node?.properties?.className
  const list = Array.isArray(className) ? className : typeof className === 'string' ? [className] : []
  for (const entry of list) {
    if (typeof entry === 'string') {
      const match = /language-([\w+#.-]+)/.exec(entry)
      if (match) return match[1]
    }
  }
  return null
}

const components: Components = {
  // A fenced block arrives as `pre > code`. Rendering `pre` lets us take over the
  // whole block (header, gutter, collapse) while keeping the parsed text.
  pre({ node, children }) {
    const codeNode = (node as HastNode | undefined)?.children?.[0]
    if (codeNode?.tagName === 'code') {
      // remark keeps the trailing newline of the fence; it would add an empty last
      // line to the gutter.
      const raw = hastText(codeNode).replace(/\n$/, '')
      return <CodeBlock code={raw} language={languageOf(codeNode)} />
    }
    return <pre>{children}</pre>
  },
  code({ className, children }) {
    // Only reached for *inline* code (blocks are handled by `pre`).
    return <code className={className}>{children}</code>
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        title={href}
        onClick={(event) => {
          event.preventDefault()
          if (href) void openUrl(href).catch(() => undefined)
        }}
      >
        {children}
      </a>
    )
  },
  input({ type, checked }) {
    if (type !== 'checkbox') return null
    return (
      <span className={`task-check${checked ? ' checked' : ''}`} aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
    )
  },
  // Remote images are never loaded (the normaliser turns them into their alt
  // text), so an image node here can only come from raw Markdown we missed.
  img({ alt }) {
    return <span className="muted">{alt ?? ''}</span>
  },
}

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly, remarkMath, remarkAlerts]

/** Module-level constants: a fresh array per render would defeat the memo. */
const REHYPE_STREAM = [rehypeKatex, rehypeStreamChars]
const REHYPE_NONE = [rehypeKatex]

export interface MarkdownBlockProps {
  text: string
  /** True only for the block that is being streamed right now. */
  animate?: boolean
}

export const MarkdownBlock = memo(function MarkdownBlock({ text, animate }: MarkdownBlockProps) {
  return (
    <div className="md-block">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={animate ? REHYPE_STREAM : REHYPE_NONE}
        components={components}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
