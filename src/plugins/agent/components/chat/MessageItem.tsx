/**
 * One message row.
 *
 * Both roles share the same shell so hover actions, the version switcher and the
 * meta line behave identically; only the body differs (bubble vs. full-width
 * Markdown).
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { Dialog, IconButton, copyText, useToast, Menu, MenuItem, MenuSeparator, type MenuAnchor } from '@/plugins/agent/components/ui/primitives'
import { MarkdownText } from '@/plugins/agent/components/markdown/MarkdownText'
import { ThinkingPanel } from './ThinkingPanel'
import { StepTimeline } from './StepTimeline'
import { useT } from '@/plugins/agent/i18n'
import { useChatStore } from '@/plugins/agent/state/chat'
import type { Attachment, Message } from '@/plugins/agent/core/types'
import { formatTokens } from '@/plugins/agent/core/tokenEstimate'
import { bodyReasoning, placeSteps } from '@/plugins/agent/core/agent/trace'

/** How long the outgoing answer stays mounted while it dissolves. */
const EXIT_MS = 340

/**
 * Keep the previous text alive for one animation when it stops being the answer.
 *
 * A step's text starts life *as* the answer (it is the last turn with no tool
 * calls) and stops being it the moment the model calls a tool. Unmounting it at
 * that instant is what produced the "text flashes then vanishes" effect; holding
 * it for EXIT_MS lets it dissolve instead.
 */
function useExitFade(value: string): { text: string; exiting: boolean } {
  const [state, setState] = useState<{ text: string; exiting: boolean }>({
    text: value,
    exiting: false,
  })
  const previous = useRef(value)

  useEffect(() => {
    if (value.length > 0) {
      previous.current = value
      setState({ text: value, exiting: false })
      return
    }
    if (previous.current.length === 0) {
      setState({ text: '', exiting: false })
      return
    }
    setState({ text: previous.current, exiting: true })
    previous.current = ''
    const timer = setTimeout(() => setState({ text: '', exiting: false }), EXIT_MS)
    return () => clearTimeout(timer)
  }, [value])

  return state
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="attachments">
      {attachments.map((attachment, index) =>
        attachment.kind === 'image' && attachment.dataUrl ? (
          <img
            key={index}
            className="attach-image"
            src={attachment.dataUrl}
            alt={attachment.name}
            loading="lazy"
          />
        ) : (
          <span className="attach-file" key={index} title={attachment.name}>
            <Icon name="file" size={13} />
            <span className="name">{attachment.name}</span>
            <span className="size">{(attachment.bytes / 1024).toFixed(0)} KB</span>
          </span>
        ),
      )}
    </div>
  )
}

/**
 * Memoised: while streaming, only the message being generated gets a new object
 * identity, so every finished message skips re-rendering entirely. Without this,
 * a 40-message conversation re-rendered its whole tree 20×/second.
 */
function TypingDots() {
  return (
    <div className="row" style={{ gap: 4, padding: '6px 2px' }} aria-label="generating">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="thinking-pulse"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </div>
  )
}

/**
 * Memoised: while streaming, only the message being generated gets a new object
 * identity, so every finished message skips re-rendering entirely. Without this,
 * a 40-message conversation re-rendered its whole tree 20×/second.
 */
export interface MessageItemProps {
  message: Message
  variantIndex: number
  variantTotal: number
  /** Whether this is the message currently being generated. */
  streaming: boolean
  /** Agent turns have side effects: no regenerate, no edit-resend, no delete. */
  canRewrite: boolean

}

function MessageItemImpl({
  message,
  variantIndex,
  variantTotal,
  streaming,
  canRewrite,
}: MessageItemProps) {
  const t = useT()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const regenerate = useChatStore((s) => s.regenerate)
  const editAndResend = useChatStore((s) => s.editAndResend)
  const removeMessage = useChatStore((s) => s.removeMessage)
  const switchVariant = useChatStore((s) => s.switchVariant)
  const forkFrom = useChatStore((s) => s.forkFrom)
  const busy = useChatStore((s) => s.streamingMessageId !== null)

  const isUser = message.role === 'user'
  const hasToolCalls = useMemo(
    () => message.steps.some((step) => step.toolCalls.length > 0),
    [message.steps],
  )

  const answer = useExitFade(message.content)

  // 右键菜单：宿主把系统菜单全局吃掉了，正文可选中后必须自己给一个「复制 / 全选」。
  const [textMenu, setTextMenu] = useState<{ anchor: MenuAnchor; node: HTMLElement } | null>(null)

  const openTextMenu = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    // 控件与工具卡自己处理交互，不抢它们的右键
    if (target.closest('button, a, input, textarea, .tool-card')) return
    event.preventDefault()
    event.stopPropagation()
    setTextMenu({ anchor: { x: event.clientX, y: event.clientY }, node: event.currentTarget })
  }

  const copySelectionOrMessage = () => {
    const selected = window.getSelection()?.toString() ?? ''
    void copyText(selected.trim() || message.content)
    toast.show(t('msg.copied'))
  }

  const selectMessage = () => {
    const node = textMenu?.node
    if (!node) return
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  /*
   * Two turns stay out of the trace:
   * - the one holding the visible answer (its text is the message body),
   * - the one currently being written (it has no text yet, only reasoning).
   * Their reasoning is rendered right above the body, so the order still reads
   * thought → text → tools.
   */
  const { timelineSteps, reasoningText, reasoningIsLive } = useMemo(() => {
    const placement = placeSteps(message.steps)
    return {
      timelineSteps: placement.timeline,
      reasoningText: bodyReasoning(message.steps, message.reasoning),
      reasoningIsLive:
        placement.active !== null &&
        streaming &&
        placement.active.content.trim().length === 0,
    }
  }, [message.steps, message.reasoning, streaming])


  const onCopy = async () => {
    if (await copyText(message.content)) toast.show(t('msg.copied'))
  }

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}`} data-message-id={message.id}>
      <div className="msg-col">
        {isUser ? (
          <>
            {message.content.trim().length > 0 && (
              <div className="bubble-user" onContextMenu={openTextMenu}>
                {message.content}
              </div>
            )}
            <AttachmentList attachments={message.attachments} />
          </>
        ) : (
          <div className="assistant-body" onContextMenu={openTextMenu}>
            {(hasToolCalls || message.steps.length > 1) && (
              <StepTimeline
                steps={timelineSteps}
                streaming={streaming}
                defaultOpen={!streaming && answer.text.trim().length === 0}
              />
            )}

            {/*
             * 思考属于「最后那一步」，所以必须排在轨迹**之后**：
             * 轨迹是已完成的回合，这一条是正在写 / 刚写完的回合。
             * 放在前面就会出现「先看到第 2 步的思考，再看到第 1 步的工具调用」。
             */}
            {reasoningText.length > 0 && (
              <ThinkingPanel
                text={reasoningText}
                reasoningStreaming={reasoningIsLive}
                thinkingMs={message.thinkingMs}
                defaultOpen={!streaming && answer.text.trim().length === 0}
              />
            )}

            {answer.exiting ? (
              <div className="md-exit" aria-hidden="true">
                <MarkdownText content={answer.text} />
              </div>
            ) : answer.text.trim().length > 0 ? (
              <MarkdownText content={answer.text} streaming={streaming} />
            ) : streaming ? (
              <TypingDots />
            ) : message.steps.length > 0 ? (
              <div className="field-hint">{t('msg.noAnswer')}</div>
            ) : null}

            {message.status === 'ERROR' && (
              <div className="banner error" style={{ marginTop: 8 }}>
                <Icon name="alert" size={14} />
                <span className="grow">{message.errorMessage || t('error.title')}</span>
              </div>
            )}

            {message.status === 'STOPPED' && message.content.trim().length > 0 && (
              <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                {t('status.stopped')}
              </div>
            )}
          </div>
        )}

        <div className="msg-meta">
          {variantTotal > 1 && (
            <span className="variant-switch">
              <IconButton
                icon="chevron-left"
                label={t('msg.variant', { n: variantIndex - 1, total: variantTotal })}
                size={12}
                disabled={variantIndex <= 1 || busy}
                onClick={() => void switchVariant(message.id, -1)}
              />
              <span>
                {variantIndex}/{variantTotal}
              </span>
              <IconButton
                icon="chevron-right"
                label={t('msg.variant', { n: variantIndex + 1, total: variantTotal })}
                size={12}
                disabled={variantIndex >= variantTotal || busy}
                onClick={() => void switchVariant(message.id, 1)}
              />
            </span>
          )}

          {!isUser && (message.model || message.tokensOut) && (
            <span className="faint">
              {message.model}
              {message.tokensOut ? ` · ${formatTokens(message.tokensOut)} tok` : ''}
              {message.ttftMs ? ` · ${(message.ttftMs / 1000).toFixed(1)}s` : ''}
            </span>
          )}

          <span className="grow" />

          <div className="msg-actions">
            <IconButton icon="copy" label={t('msg.copy')} size={13} onClick={onCopy} />
            {!isUser && canRewrite && (
              <IconButton
                icon="refresh"
                label={t('msg.regenerate')}
                size={13}
                disabled={busy}
                onClick={() => void regenerate(message.id)}
              />
            )}
            {isUser && canRewrite && (
              <IconButton
                icon="edit"
                label={t('msg.edit')}
                size={13}
                disabled={busy}
                onClick={() => {
                  setEditText(message.content)
                  setEditing(true)
                }}
              />
            )}
            <IconButton
              icon="branch"
              label={t('msg.fork')}
              size={13}
              onClick={() => void forkFrom(message.id)}
            />
            {canRewrite && (
              <IconButton
                icon="trash"
                label={t('msg.delete')}
                size={13}
                danger
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              />
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title={t('msg.edit')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!editText.trim()}
              onClick={() => {
                setEditing(false)
                void editAndResend(message.id, editText.trim())
              }}
            >
              {t('common.confirm')}
            </button>
          </>
        }
      >
        <textarea
          className="textarea"
          style={{ minHeight: 180 }}
          value={editText}
          onChange={(event) => setEditText(event.target.value)}
          autoFocus
        />
        <div className="field-hint">{t('msg.editHint')}</div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('msg.delete')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setConfirmDelete(false)
                void removeMessage(message.id)
              }}
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <div className="muted">{t('msg.deleteConfirm')}</div>
      </Dialog>

      <Menu anchor={textMenu?.anchor ?? null} onClose={() => setTextMenu(null)}>
        <MenuItem
          icon="copy"
          onClick={() => {
            copySelectionOrMessage()
            setTextMenu(null)
          }}
        >
          {t('msg.copy')}
        </MenuItem>
        <MenuItem
          icon="check"
          onClick={() => {
            selectMessage()
            setTextMenu(null)
          }}
        >
          {t('msg.selectAll')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon="copy"
          onClick={() => {
            void copyText(message.content)
            toast.show(t('msg.copied'))
            setTextMenu(null)
          }}
        >
          {t('msg.copyMessage')}
        </MenuItem>
      </Menu>
    </div>
  )
}

/**
 * Memoised: while streaming, only the message being generated gets a new object
 * identity, so every finished message skips re-rendering entirely. Without this,
 * a 40-message conversation re-rendered its whole tree 20×/second.
 */
export const MessageItem = memo(MessageItemImpl)