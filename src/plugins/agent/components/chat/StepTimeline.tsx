/**
 * The execution trace of an assistant turn, in chronological order.
 *
 * One flat list, one entry per thing that happened: a short reasoning line, the
 * text the model wrote, then the tool calls it made — repeated per model turn.
 * Hoisting all reasoning into a single block at the top destroys that order: you
 * can no longer tell which thought belongs to which call.
 *
 * The turn that produced the visible answer is excluded here; its text is the
 * message body and its reasoning is rendered immediately above that body.
 */

import { useEffect, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { useT } from '@/plugins/agent/i18n'
import { MarkdownText } from '@/plugins/agent/components/markdown/MarkdownText'
import { ToolCard } from './ToolCard'
import type { AgentStep } from '@/plugins/agent/core/types'

/** One collapsed reasoning line; expands to the full chain of thought. */
function ReasoningLine({ text, streaming }: { text: string; streaming: boolean }) {
  const t = useT()
  // 正在想的这一轮展开；想完（streaming 转 false）就折叠回去
  const [open, setOpen] = useState(streaming)
  useEffect(() => {
    setOpen(streaming)
  }, [streaming])
  const preview = text.replace(/\s+/g, ' ').trim()

  return (
    <div className="trace-reasoning">
      <div
        className="disclosure"
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setOpen(!open)
        }}
      >
        {streaming ? <span className="thinking-pulse" /> : <Icon name="brain" size={12} />}
        <span>{streaming ? t('thinking.now') : t('thinking.label')}</span>
        {!open && <span className="count truncate">{preview}</span>}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </div>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  )
}

export function StepTimeline({
  steps,
  streaming,
  defaultOpen = false,
}: {
  steps: AgentStep[]
  streaming: boolean
  /** 没有正文时默认摊开：否则只剩一行「执行过程」，看着像什么都没发生 */
  defaultOpen?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    setOpen(streaming ? true : defaultOpen)
  }, [streaming, defaultOpen])

  if (steps.length === 0) return null

  const toolCount = steps.reduce((sum, step) => sum + step.toolCalls.length, 0)

  return (
    <div className="steps">
      <div
        className="disclosure"
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setOpen(!open)
        }}
      >
        <Icon name="layers" size={13} />
        <span>
          {t('agent.timeline')}
          <span className="count">
            {' · '}
            {steps.length} {t('agent.stepsUnit')}
            {toolCount > 0 ? ` · ${toolCount} ${t('agent.toolsUnit')}` : ''}
          </span>
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </div>

      {open && (
        <div className="steps-list">
          {steps.map((step) => {
            const lastStep = step === steps[steps.length - 1]
            const reasoningStreaming =
              streaming &&
              lastStep &&
              step.content.trim().length === 0 &&
              step.toolCalls.length === 0

            return (
              <div className="trace-step" key={step.index}>
                <div className="trace-step-head">
                  <span className="trace-step-index">#{step.index + 1}</span>
                  {step.toolCalls.length > 0 && (
                    <span>{step.toolCalls.length} {t('agent.toolsUnit')}</span>
                  )}
                </div>
                {step.reasoning.trim().length > 0 && (
                  <ReasoningLine text={step.reasoning} streaming={reasoningStreaming} />
                )}
                {step.content.trim().length > 0 && (
                  <div className="trace-text">
                    <MarkdownText content={step.content} streaming={streaming && lastStep} />
                  </div>
                )}
                {step.toolCalls.map((call) => (
                  <ToolCard key={call.id} call={call} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Progress list written by the model via `todo_write`. */
export function TodoPanel({
  todos,
  open = true,
  onToggle,
}: {
  todos: Array<{ content: string; status: string }>
  /** 折叠状态由 ChatView 持有（要记住偏好，也要据此调整正文底部留白） */
  open?: boolean
  onToggle?: () => void
}) {
  const t = useT()
  if (todos.length === 0) return null

  const done = todos.filter((todo) => todo.status === 'completed').length
  const head = (
    <>
      <Icon name="list" size={12} />
      <span>{t('agent.todos')}</span>
      <span className="faint">
        {done}/{todos.length}
      </span>
      {onToggle && (
        <span className="todo-toggle">
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </span>
      )}
    </>
  )

  return (
    <div className={`todos${open ? '' : ' collapsed'}`}>
      {onToggle ? (
        <button
          type="button"
          className="todos-head"
          aria-expanded={open}
          title={t(open ? 'agent.todosCollapse' : 'agent.todosExpand')}
          onClick={onToggle}
        >
          {head}
        </button>
      ) : (
        <div className="todos-head">{head}</div>
      )}
      {open &&
        todos.map((todo, index) => (
          <div key={index} className={`todo-item ${todo.status}`}>
            <span className="todo-mark">{todo.status === 'completed' ? '✓' : ''}</span>
            <span>{todo.content}</span>
          </div>
        ))}
    </div>
  )
}
