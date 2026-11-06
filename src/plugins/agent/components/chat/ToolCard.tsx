/**
 * One tool call, as a card.
 *
 * The card is the trust boundary made visible: what the model asked for, the
 * exact arguments, whether it ran, and what came back. Collapsed it is one line —
 * the arguments matter when something goes wrong, not before.
 */

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { parseToolArgs, toolSummary } from '@/plugins/agent/core/agent/tools'
import { useT } from '@/plugins/agent/i18n'
import type { ToolCall } from '@/plugins/agent/core/types'

const STATUS_KEY: Record<ToolCall['status'], string> = {
  pending: 'agent.toolPending',
  approved: 'agent.toolRunning',
  running: 'agent.toolRunning',
  done: 'agent.toolDone',
  error: 'agent.toolError',
  denied: 'agent.toolDenied',
}

export function ToolCard({ call }: { call: ToolCall }) {
  const t = useT()
  const active = call.status === 'pending' || call.status === 'running'
  const [open, setOpen] = useState(active)

  // A call that starts running should reveal itself; once finished it can be
  // tucked away unless the user opened it manually.
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  const summary = useMemo(() => toolSummary(call), [call])
  const prettyArgs = useMemo(() => {
    const parsed = parseToolArgs(call.args)
    if (Object.keys(parsed).length === 0) return call.args
    try {
      return JSON.stringify(parsed, null, 2)
    } catch {
      return call.args
    }
  }, [call.args])

  const statusLabel = t(STATUS_KEY[call.status] as never)

  return (
    <div className="tool-card">
      <div className="tool-head" onClick={() => setOpen((value) => !value)}>
        <Icon name={call.status === 'running' ? 'loader' : 'wrench'} size={13} />
        <span className="tool-name">{call.name}</span>
        <span className="tool-summary" title={summary}>
          {summary}
        </span>
        {call.result && (
          <span className="faint mono" style={{ fontSize: 10.5, flex: '0 0 auto' }}>
            {call.result.durationMs} ms
          </span>
        )}
        <span className={`tool-status ${call.status}`}>{statusLabel}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </div>

      {open && (
        <div className="tool-body">
          <div>
            <div className="tool-block-label">{t('agent.arguments')}</div>
            <pre className="tool-pre">{prettyArgs || '{}'}</pre>
          </div>
          {call.result && (
            <div>
              <div className="tool-block-label">{t('agent.result')}</div>
              <pre className="tool-pre">{call.result.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
