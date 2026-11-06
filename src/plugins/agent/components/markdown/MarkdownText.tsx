/**
 * The rendering pipeline.
 *
 * ```
 * content
 *   ↓ normalizeHtml      HTML → Markdown, reference links inlined, blanks collapsed
 *   ↓ normalizeSoftBreaks bare newline → paragraph boundary
 *   ↓ splitMarkdownBlocks blank-line split, fence aware, same-family merge
 *   ↓ <MarkdownBlock>     one parse per block, memoised on `text`
 * ```
 *
 * ### Why the order matters
 *
 * `normalizeHtml` emits hard-break markers (`  \n`) for `<br>`; `normalizeSoftBreaks`
 * must see those *after* they exist, otherwise `<br>` text gets folded into the
 * paragraph. And both must agree with the splitter about fenced code, or the same
 * content would be torn into two different shapes.
 *
 * ### Two gates for streaming cost
 *
 * * **Rate**: sample at 50 ms — the same cadence the store commits at. Faster
 *   yields no new content; slower drops visible frames.
 * * **Volume**: only the tail block re-parses. Completed blocks have unchanged
 *   `text`, so `memo` skips them entirely.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { normalizeHtml } from '@/plugins/agent/core/markdown/htmlNormalize'
import { normalizeSoftBreaks } from '@/plugins/agent/core/markdown/softBreaks'
import { splitMarkdownBlocks } from '@/plugins/agent/core/markdown/blockSplitter'
import { MarkdownBlock } from './MarkdownBlock'
import { useT } from '@/plugins/agent/i18n'

/**
 * Keep the tail block from shrinking while half-typed syntax is resolved
 * (`**bold` re-flows when the closing `**` lands).
 *
 * The min-height is applied to an outer wrapper; the inner element is what gets
 * measured, so growing the wrapper can never feed back into the measurement.
 */
function RetainHeight({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const tallest = useRef(0)

  useLayoutEffect(() => {
    const measured = inner.current?.offsetHeight ?? 0
    if (measured > tallest.current) {
      tallest.current = measured
      if (outer.current) outer.current.style.minHeight = ''
      return
    }
    if (outer.current && tallest.current > 0) {
      outer.current.style.minHeight = `${tallest.current}px`
    }
  })

  return (
    <div ref={outer} style={{ overflowAnchor: 'none' }}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

/* ── 平滑出字：把「到达」和「渲染」解耦 ──────────────────────────────────
 *
 * 网络侧的增量是**突发**的（一个 SSE 包 0 字，下一个 12 字），如果来多少就渲染
 * 多少，排版和字体测量会跟着一顿一顿地跳。这里先收进缓冲，再用**固定节奏**
 * 按比例追赶：
 *
 * - 每 REVEAL_INTERVAL_MS 推进一帧（而不是每来一个 delta 推一次）
 * - 每帧推进量 = 积压 × REVEAL_RATIO，所以积压多时追得快、积压少时字字落定
 * - 流结束时立刻补齐，不会把尾巴拖在缓冲里
 *
 * 代价是滞后几十到一百多毫秒；换来的是**匀速前进**的观感和稳定的排版。
 */
const REVEAL_INTERVAL_MS = 32
const REVEAL_RATIO = 0.3

function useSmoothReveal(content: string, streaming: boolean): string {
  const [shown, setShown] = useState(content)
  const target = useRef(content)
  const cursor = useRef(content)
  target.current = content

  useEffect(() => {
    if (!streaming) {
      // 流结束 / 非流式：直接对齐，不补动画
      cursor.current = target.current
      setShown(target.current)
      return
    }

    let frame = 0
    let lastCommit = 0

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - lastCommit < REVEAL_INTERVAL_MS) return

      const latest = target.current
      const current = cursor.current

      // 换消息 / 被截断：直接跳过去
      if (!latest.startsWith(current)) {
        cursor.current = latest
        lastCommit = now
        setShown(latest)
        return
      }
      if (latest.length === current.length) return

      lastCommit = now
      const backlog = latest.length - current.length
      let end = current.length + Math.max(1, Math.ceil(backlog * REVEAL_RATIO))
      if (end > latest.length) end = latest.length
      // 不要把代理对切成两半（emoji 会闪一帧方块）
      const code = latest.charCodeAt(end - 1)
      if (end < latest.length && code >= 0xd800 && code <= 0xdbff) end -= 1

      const next = latest.slice(0, end)
      cursor.current = next
      setShown(next)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [streaming])

  return streaming ? shown : content
}

export function MarkdownText({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const t = useT()

  // 先按固定节奏放出可见前缀，再做 markdown 归一化 —— 后面的每一步都只处理
  // 已经稳定的那段文本。
  const revealed = useSmoothReveal(content, streaming)

  const normalized = useMemo(
    () => normalizeSoftBreaks(normalizeHtml(revealed, { imageAlt: () => t('md.image') })),
    [revealed, t],
  )

  const blocks = useMemo(() => splitMarkdownBlocks(normalized), [normalized])

  return (
    <div className="md">
      {blocks.map((block, index) => {
        const isTail = streaming && index === blocks.length - 1
        // `--i` drives the 30ms stagger of the blur-in animation. It sits on the
        // wrapper, not on MarkdownBlock, so the memoised block keeps its props.
        return (
          <div
            className="md-slot"
            key={block.start}
            style={{ ['--i' as string]: Math.min(index, 8) }}
          >
            {isTail ? (
              <RetainHeight>
                <MarkdownBlock text={block.text} animate />
              </RetainHeight>
            ) : (
              <MarkdownBlock text={block.text} />
            )}
          </div>
        )
      })}
    </div>
  )
}