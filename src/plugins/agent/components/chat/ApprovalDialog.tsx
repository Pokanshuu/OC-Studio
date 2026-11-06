/**
 * Tool-call approval prompt.
 *
 * This is the only place where a model can reach the user's disk, so it shows the
 * *exact* arguments rather than a friendly paraphrase. "Allow always" is scoped
 * to the current session and per tool name — never persisted.
 */

import { useMemo } from 'react'
import { Dialog } from '@/plugins/agent/components/ui/primitives'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { useChatStore } from '@/plugins/agent/state/chat'
import { useT } from '@/plugins/agent/i18n'
import { toolByName } from '@/plugins/agent/core/agent/tools'

export function ApprovalDialog() {
  const t = useT()
  const approvals = useChatStore((s) => s.approvals)
  const resolve = useChatStore((s) => s.resolveApproval)

  const pending = approvals[0]
  const spec = useMemo(() => (pending ? toolByName(pending.call.name) : undefined), [pending])

  if (!pending) return null

  const pretty = (() => {
    try {
      return JSON.stringify(JSON.parse(pending.call.args || '{}'), null, 2)
    } catch {
      return pending.call.args
    }
  })()

  return (
    <Dialog
      open
      onClose={() => resolve(pending.call.id, 'deny')}
      title={
        <span className="row" style={{ gap: 8 }}>
          <Icon name="alert" size={16} style={{ color: 'var(--warning)' }} />
          {t('agent.approveTitle')}
        </span>
      }
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={() => resolve(pending.call.id, 'deny')}>
            {t('agent.deny')}
          </button>
          <button className="btn quiet" onClick={() => resolve(pending.call.id, 'always')}>
            {t('agent.allowAlways')}
          </button>
          <button className="btn primary" onClick={() => resolve(pending.call.id, 'allow')}>
            {t('agent.allow')}
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 12.5 }}>
        {t('agent.approveHint')}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="tool-name" style={{ fontSize: 13 }}>
          {pending.call.name}
        </span>
        <span className="faint truncate" style={{ fontSize: 12 }}>
          {spec?.description ?? ''}
        </span>
      </div>
      <pre className="tool-pre" style={{ maxHeight: 300 }}>
        {pretty}
      </pre>
      {approvals.length > 1 && (
        <div className="faint" style={{ fontSize: 11.5 }}>
          {approvals.length - 1} more pending
        </div>
      )}
    </Dialog>
  )
}
