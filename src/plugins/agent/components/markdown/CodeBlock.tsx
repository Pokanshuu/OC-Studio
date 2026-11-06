/**
 * Fenced code block: language label, line numbers, copy button, line-count
 * based collapsing, and **incremental** syntax highlighting.
 *
 * Two performance ideas (both inherited from the Android implementation):
 *
 * 1. **Collapsed blocks only lay out what you can see.** A 2 000-line block
 *    clipped to 300 px would otherwise still typeset (and tokenize) every line.
 *    Collapsed rendering feeds only the first `COLLAPSED_RENDER_LINES` lines.
 * 2. **The highlighter is incremental** — see `core/markdown/highlight.ts`. The
 *    same instance is reused across renders, so streaming only re-tokenizes the
 *    last line.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IncrementalHighlighter,
  segmentsOf,
  canonicalLanguage,
} from '@/plugins/agent/core/markdown/highlight'
import { useT } from '@/plugins/agent/i18n'
import { copyText } from '@/plugins/agent/components/ui/primitives'
import { Icon } from '@/plugins/agent/components/ui/Icon'

/** Beyond this many lines the block starts collapsed. */
const COLLAPSE_LINE_THRESHOLD = 20

/** While collapsed, only this many lines are typeset (4× the 300 px viewport). */
const COLLAPSED_RENDER_LINES = 60

/** Keep the first `n` lines, cutting on a line boundary. */
export function truncatedToLines(code: string, n: number): string {
  let index = 0
  let line = 0
  while (line < n) {
    const next = code.indexOf('\n', index)
    if (next < 0) return code
    index = next + 1
    line++
  }
  return code.slice(0, index)
}

export function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const highlighter = useRef(new IncrementalHighlighter())

  const lineCount = useMemo(() => code.split('\n').length, [code])
  const collapsible = lineCount > COLLAPSE_LINE_THRESHOLD

  const shown = useMemo(
    () => (collapsible && !expanded ? truncatedToLines(code, COLLAPSED_RENDER_LINES) : code),
    [code, collapsible, expanded],
  )

  const canonical = useMemo(() => canonicalLanguage(language), [language])
  const segments = useMemo(() => {
    const spans = highlighter.current.spansFor(shown, canonical)
    return segmentsOf(shown, spans)
  }, [shown, canonical])

  const gutter = useMemo(() => {
    const lines = shown.split('\n').length
    return Array.from({ length: lines }, (_v, i) => i + 1).join('\n')
  }, [shown])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])

  const onCopy = async () => {
    if (await copyText(code)) setCopied(true)
  }

  return (
    <div className={`code-block${collapsible && !expanded ? ' collapsed' : ''}`}>
      <div className="code-head">
        <span className="code-lang">{language?.trim() || t('md.code')}</span>
        {/* The line count is always shown: it answers "how long is this" and
            "how much did collapsing hide" at the same time. */}
        <span className="code-meta">{t('md.lines', { n: lineCount })}</span>
        <button type="button" className={`code-copy${copied ? ' copied' : ''}`} onClick={onCopy}>
          <Icon name={copied ? 'check' : 'copy'} size={12} />
          {copied ? t('md.copied') : t('md.copyCode')}
        </button>
      </div>

      <div className="code-body">
        {lineCount > 1 && (
          <div className="code-gutter" aria-hidden="true">
            {gutter}
          </div>
        )}
        <pre className="code-pre">
          <code>
            {segments.map((segment, index) =>
              segment.className ? (
                <span key={index} className={segment.className}>
                  {segment.text}
                </span>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </code>
        </pre>
      </div>

      {collapsible && (
        <button
          type="button"
          className="code-expand"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('md.collapse') : t('md.expandAll', { n: lineCount })}
        </button>
      )}
    </div>
  )
}
