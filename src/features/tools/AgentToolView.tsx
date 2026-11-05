'use client'

/**
 * 工具 › 助手 —— 对话壳（`docs/插件.md` §0.2）。
 *
 * 这一版只做**对话**：发消息、流式收、可中止。工具循环（读库 / 检索 / 写回）
 * 下一步接 `lib/capabilities`，写入要带 `actor` 走落盘链路，不在这里开口子。
 *
 * 界面纪律：沿用宿主的纸墨与令牌，不做聊天 App 的深色皮；助理正文用正文字号、
 * 用户发言右侧浅底块，模型标签只写一次（`文案节制`）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Settings2, Square } from 'lucide-react'
import { streamChat, type AgentMessage } from '@/lib/plugins/agent/chat'
import { buildLibraryContext } from '@/lib/plugins/agent/context'
import { AGENT_PLUGIN, hasPermission } from '@/lib/plugins'
import { useAgentProvider } from '@/lib/plugins/agent/config'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_ROW,
  ICON_BTN,
  LOADING_TEXT,
  ROUND_CONTROL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'

export function AgentToolView() {
  const { config, save, ready } = useAgentProvider()
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState(config)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  /** 读库是逐项授权：设置里关掉这项，就只是聊天窗口 */
  const canReadLibrary = hasPermission(AGENT_PLUGIN, 'read-entities')
  /** 流式增量先攒在 ref 里，按帧刷进 state —— 每个 token 一次 setState 会把输入框拖死 */
  const bufferRef = useRef('')
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 配置从 localStorage 水合后才到手，草稿要跟一次
    setDraft(config)
  }, [config])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, streaming])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const flushBuffer = useCallback(() => {
    frameRef.current = null
    const text = bufferRef.current
    setMessages((previous) => {
      const last = previous[previous.length - 1]
      if (!last || last.role !== 'assistant') return previous
      return [...previous.slice(0, -1), { ...last, content: text }]
    })
  }, [])

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (text === '' || streaming || !ready) return
    const next: AgentMessage[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]
    setMessages(next)
    setInput('')
    setError(null)
    setStreaming(true)
    bufferRef.current = ''
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // 授权了「读实体」才把库概览带上；没授权就纯对话（不报错、不假装读过）
      const library = canReadLibrary ? await buildLibraryContext() : ''
      const history = next.slice(0, -1)
      const payload: AgentMessage[] =
        library === '' ? history : [{ role: 'system', content: library }, ...history]

      await streamChat({
        config,
        messages: payload,
        signal: controller.signal,
        onDelta: (chunk) => {
          bufferRef.current += chunk
          if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushBuffer)
        },
      })
    } catch (err) {
      if (controller.signal.aborted) {
        setError('已停止')
      } else {
        setError(err instanceof Error ? err.message : '请求失败')
      }
    } finally {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        flushBuffer()
      }
      abortRef.current = null
      setStreaming(false)
    }
  }

  const stop = (): void => {
    abortRef.current?.abort()
  }

  if (!ready || showSettings) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">模型</span>
          {ready ? (
            <button type="button" onClick={() => setShowSettings(false)} className={`${BTN_QUIET} ml-auto`}>
              返回对话
            </button>
          ) : null}
        </div>

        <div className="flex max-w-md flex-col">
          <label className={FIELD_ROW}>
            <span className={FIELD_LABEL}>端点</span>
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="https://api.deepseek.com/v1"
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_ROW}>
            <span className={FIELD_LABEL}>模型</span>
            <input
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              placeholder="deepseek-chat"
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_ROW}>
            <span className={FIELD_LABEL}>密钥</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder="sk-…"
              className={FIELD_INPUT}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => save(draft)} className={BTN_PRIMARY}>
            保存
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">密钥只留本机，不进笔记库</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <span className="truncate text-[12px] text-ink-faint">{config.model}</span>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="模型设置"
          title="模型设置"
          className={`${ICON_BTN} ml-auto`}
        >
          <Settings2 size={14} strokeWidth={2} />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className={LOADING_TEXT}>问点什么</span>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === 'user'
                    ? `ml-auto max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-[13px] text-ink ${ROUND_CONTROL} bg-[var(--oc-hover)]`
                    : `max-w-[92%] whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink ${ROUND_ITEM}`
                }
              >
                {message.content === '' && message.role === 'assistant' && streaming ? (
                  <span className="text-ink-faint">…</span>
                ) : (
                  message.content
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="shrink-0 px-4 text-[11px] text-error">{error}</p> : null}

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className={`mx-auto flex w-full max-w-3xl items-end gap-2 border border-line p-1.5 ${ROUND_CONTROL}`}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="说点什么"
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {streaming ? (
            <button type="button" onClick={stop} aria-label="停止" title="停止" className={ICON_BTN}>
              <Square size={13} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={input.trim() === ''}
              aria-label="发送"
              title="发送"
              className={`${ICON_BTN} disabled:opacity-40`}
            >
              <ArrowUp size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
