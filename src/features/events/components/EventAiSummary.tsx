'use client'

import { Sparkles } from 'lucide-react'
import type { EventForm } from '../hooks/useEventForm'

/** AI 概括（仅在设置里开启 AI 时渲染） */
export function EventAiSummary({ form }: { form: EventForm }) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <button
          onClick={form.handleAISummarize}
          disabled={form.aiLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-warning transition-colors hover:bg-[var(--oc-hover)] disabled:opacity-50"
        >
          <Sparkles size={14} strokeWidth={2} />
          <span>{form.aiLoading ? '生成中...' : 'AI 概括'}</span>
        </button>
      </div>
      {form.summary ? (
        <p className="mt-2 max-w-[60ch] text-sm text-ink-muted">{form.summary}</p>
      ) : null}
    </section>
  )
}
