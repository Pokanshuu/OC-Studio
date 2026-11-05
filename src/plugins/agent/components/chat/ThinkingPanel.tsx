/**
 * The thinking panel.
 *
 * Two behaviours worth naming, both carried over from the Android app:
 *
 * * **Tail mode while thinking.** Only the last few hundred characters are shown
 *   during streaming, so the panel does not grow a line at a time and shove the
 *   answer down the screen. It is about layout stability, not about hiding text.
 * * **Auto-collapse is a setting, not a constant.** When `autoCollapseThinking`
 *   is on, the panel folds to one line the moment the answer starts. When it is
 *   off, the reasoning stays open for the whole reply. A manual toggle always
 *   wins for the message it was used on.
 */

import { useEffect, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { useT } from '@/plugins/agent/i18n'
import { useSettingsStore } from '@/plugins/agent/state/settings'

/** How much of the tail to keep visible while the model is still thinking. */
const TAIL_CHARS = 700

export function ThinkingPanel({
  text,
  reasoningStreaming,
  thinkingMs,
}: {
  text: string
  /** The chain of thought is still being written (the answer has not started). */
  reasoningStreaming: boolean
  thinkingMs: number | null
}) {
  const t = useT()
  const autoCollapse = useSettingsStore((s) => s.settings.ui.autoCollapseThinking)
  // 思考时展开；思考结束（正文开始）按设置收起。中途点击以用户为准，
  // 直到下一次「开始思考 / 思考结束」状态切换。
  const [expanded, setExpanded] = useState(reasoningStreaming || !autoCollapse)
  useEffect(() => {
    setExpanded(reasoningStreaming || !autoCollapse)
  }, [reasoningStreaming, autoCollapse])
  const seconds = thinkingMs ? Math.max(1, Math.round(thinkingMs / 1000)) : null

  const label = reasoningStreaming
    ? t('thinking.now')
    : seconds
      ? t('thinking.done', { s: seconds })
      : t('thinking.collapse')

  const body = reasoningStreaming
    ? text.length > TAIL_CHARS
      ? `…${text.slice(-TAIL_CHARS)}`
      : text
    : text

  return (
    <div className="thinking">
      <div
        className="disclosure"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setExpanded(!expanded)
        }}
      >
        {reasoningStreaming ? (
          <span className="thinking-pulse" />
        ) : (
          <Icon name="brain" size={13} />
        )}
        <span>{label}</span>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
      </div>
      <div className={`collapse${expanded ? ' open' : ''}`}>
        <div>
          <div className={`thinking-body${reasoningStreaming ? ' tail' : ''}`}>{body}</div>
        </div>
      </div>
    </div>
  )
}
