/**
 * Composer: text, attachments, and the parameter controls that decide what goes
 * into the request.
 *
 * Deliberately quiet — the numbers (context usage, model, activity) live in the
 * status bar, so this row only holds controls: mode, workspace (agent only),
 * model, reasoning, attachments, and send.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { Menu, MenuItem, useToast, type MenuAnchor } from '@/plugins/agent/components/ui/primitives'
import { ContextDialog } from './ContextDialog'
import { ContextStrip } from './ContextStrip'
import { getAgentSessionContext, setAgentSessionContext } from '@/lib/plugins/agent-session'
import { useChatStore } from '@/plugins/agent/state/chat'
import { useSettingsStore } from '@/plugins/agent/state/settings'
import { useT } from '@/plugins/agent/i18n'
import { findModel, knownModels } from '@/plugins/agent/core/provider'
import { activePath } from '@/plugins/agent/core/messageTree'
import { messageToOut } from '@/plugins/agent/core/chatRequest'
import { orderedOutgoingMessages } from '@/plugins/agent/core/requestOrdering'
import { estimateTokens, estimateTokensOfAll, formatTokens } from '@/plugins/agent/core/tokenEstimate'
import { cmd } from '@/plugins/agent/api/bridge'
import type { Attachment, ConversationMode, ReasoningLevel } from '@/plugins/agent/core/types'

/** Hard cap for pasted images — same order of magnitude as the file picker. */
const MAX_PASTED_IMAGE_BYTES = 12 * 1024 * 1024

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'json', 'csv', 'yaml', 'yml', 'log', 'xml', 'html',
  'ts', 'js', 'py', 'rs', 'go', 'java', 'kt', 'c', 'h', 'cpp', 'css',
]

function extensionOf(path: string): string {
  const index = path.lastIndexOf('.')
  return index < 0 ? '' : path.slice(index + 1).toLowerCase()
}

async function attachmentFromPath(path: string): Promise<Attachment | null> {
  const ext = extensionOf(path)
  if (IMAGE_EXTENSIONS.includes(ext)) {
    const image = await cmd.readImageFile(path)
    return { kind: 'image', name: image.name, bytes: image.bytes, dataUrl: image.dataUrl }
  }
  const file = await cmd.readTextFile(path)
  return {
    kind: 'text',
    name: file.name,
    bytes: file.bytes,
    data: file.text,
    extracted: file.extracted,
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * 上下文占用百分比的显示口径。
 *
 * 1M 窗口下 3.9k 只占 0.39% —— `Math.round` 会把它显示成 `0%`，读数看起来像坏了。
 * 所以小比例保留一位小数，再小就给 `<0.1%`（真的接近空）。
 */
function formatContextPercent(ratio: number): string {
  if (ratio <= 0) return '0%'
  const percent = ratio * 100
  if (percent < 0.1) return '<0.1%'
  if (percent < 10) return `${percent.toFixed(1)}%`
  return `${Math.round(percent)}%`
}

export function Composer() {
  const t = useT()
  const toast = useToast()

  const draft = useChatStore((s) => s.draft)
  const setDraft = useChatStore((s) => s.setDraft)
  const send = useChatStore((s) => s.send)
  const stop = useChatStore((s) => s.stop)
  const streaming = useChatStore((s) => s.streamingMessageId !== null)
  const messageCount = useChatStore((s) => s.allMessages.length)
  /**
   * 生成中消息**条数**不变，只靠 messageCount 触发重算的话读数会一直冻在回合开始那一刻。
   * 这个选择器只返回流式正文（字符串），每来一段 token 只让 Composer 重渲染一次；
   * 整条 message 不进依赖，避免把无关字段的变动也卷进来。
   */
  const streamingText = useChatStore((s) => {
    if (!s.streamingMessageId) return ''
    const message = s.allMessages.find((item) => item.id === s.streamingMessageId)
    return message?.content ?? ''
  })
  const compaction = useChatStore((s) => s.compaction)
  const overheadTokens = useChatStore((s) => s.overheadTokens)
  const compacting = useChatStore((s) => s.compacting)
  const compact = useChatStore((s) => s.compact)
  const clearCompaction = useChatStore((s) => s.clearCompaction)
  const mode = useChatStore((s) => s.mode)
  const setMode = useChatStore((s) => s.setMode)
  const currentId = useChatStore((s) => s.currentId)
  const conversations = useChatStore((s) => s.conversations)
  const banner = useChatStore((s) => s.banner)
  const setBanner = useChatStore((s) => s.setBanner)

  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [contextOpen, setContextOpen] = useState(false)
  const [contextVersion, setContextVersion] = useState(0)
  const [menu, setMenu] = useState<{
    kind: 'model' | 'mode' | 'attach'
    anchor: MenuAnchor
  } | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const conversation = conversations.find((c) => c.id === currentId) ?? null
  const effectiveMode: ConversationMode = conversation?.mode ?? mode
  const isAgent = effectiveMode === 'AGENT'
  // contextVersion 只用来在保存资料后强制重算（localStorage 不是响应式的）
  const sessionContext = useMemo(
    () => getAgentSessionContext(currentId),
    [currentId, contextVersion],
  )
  // Agent 会话的模式不可改：切出去会丢掉工具语义，也切不回来
  const modeLocked = conversation?.mode === 'AGENT'
  const modeOptions: ConversationMode[] = conversation
    ? modeLocked
      ? []
      : ['CREATIVE', 'ROLEPLAY']
    : ['CREATIVE', 'ROLEPLAY', 'AGENT']

  const models = useMemo(() => knownModels(settings.api.provider), [settings.api.provider])

  /** Centred line under the box: replies · estimated context · usage. */
  const metrics = useMemo(() => {
    const snapshot = useChatStore.getState().allMessages
    const path = activePath(snapshot)
    const outgoing = orderedOutgoingMessages(path, compaction)
    const texts: string[] = []
    if (compaction) texts.push(compaction.summary)
    // 按**真正发出去的东西**算：助手每一轮的工具调用与工具结果都会回放给模型，
    // 只数 message.content 会漏掉 run_shell / 读取文件那种大段输出。
    for (const message of outgoing) {
      for (const out of messageToOut(message)) {
        if (typeof out.content === 'string') {
          texts.push(out.content)
        } else {
          for (const part of out.content) {
            if (part.type === 'text') texts.push(part.text)
          }
        }
      }
      // 图片不按 data URL 的 base64 长度算，按视觉 token 上限估
      for (const attachment of message.attachments) {
        if (attachment.kind === 'image') texts.push('x'.repeat(4096))
      }
    }
    for (const attachment of attachments) {
      if (attachment.kind === 'text' && attachment.data) texts.push(attachment.data)
      else if (attachment.kind === 'image') texts.push('x'.repeat(4096))
    }
    const base = estimateTokensOfAll(texts)
    const override = settings.api.contextWindow
    const window =
      override !== null && override > 0
        ? override
        : findModel(settings.api.provider, settings.api.model).contextWindow
    return {
      base,
      window,
      replies: snapshot.filter((m) => m.role === 'assistant' && m.active).length,
    }
    // 粗粒度依赖：条数变化、换会话、压缩、附件或模型变化才重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, currentId, compaction, attachments, settings.api.provider, settings.api.model, settings.api.contextWindow])

  // 流式中的那一条还在 STREAMING、没进 outgoing，但它马上就是下一轮的上下文。
  // overheadTokens 是最近一次请求的「系统提示词 + 工具 schema」，同样不算在消息里。
  const used = metrics.base + overheadTokens + estimateTokens(streamingText)
  const ratio = metrics.window > 0 ? Math.min(1, used / metrics.window) : 0

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
  }, [draft])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return
        void addPaths(event.payload.paths)
      })
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => undefined)
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addPaths(paths: string[]) {
    const added: Attachment[] = []
    for (const path of paths) {
      try {
        const attachment = await attachmentFromPath(path)
        if (attachment) added.push(attachment)
      } catch (error) {
        toast.show(error instanceof Error ? error.message : String(error), 'error')
      }
    }
    if (added.length > 0) setAttachments((current) => [...current, ...added])
  }

  /**
   * Paste an image straight from the clipboard (screenshot tool, browser,
   * Explorer). Text pastes are left untouched so normal typing still works.
   */
  const onPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const files = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (files.length === 0) return
    event.preventDefault()

    for (const file of files) {
      if (file.size > MAX_PASTED_IMAGE_BYTES) {
        toast.show(t('composer.imageTooLarge'), 'error')
        continue
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.png`
        setAttachments((current) => [
          ...current,
          { kind: 'image', name, bytes: file.size, dataUrl },
        ])
      } catch (error) {
        toast.show(error instanceof Error ? error.message : String(error), 'error')
      }
    }
  }

  async function pickFiles(kind: 'image' | 'file') {
    const filters =
      kind === 'image'
        ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
        : [{ name: 'Text documents', extensions: [...TEXT_EXTENSIONS, 'docx'] }]
    const picked = await open({ multiple: true, filters })
    if (!picked) return
    await addPaths(Array.isArray(picked) ? picked : [picked])
  }

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !streaming

  const submit = () => {
    if (!canSend) return
    const payload = attachments
    setAttachments([])
    void send(draft, payload)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return
    const withModifier = event.ctrlKey || event.metaKey
    if (settings.ui.sendKey === 'enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (settings.ui.sendKey === 'ctrlEnter' && withModifier) {
      event.preventDefault()
      submit()
    }
  }

  const reasoningLabel =
    settings.api.thinking === 'off'
      ? t('composer.reasoningOff')
      : settings.api.thinking === 'max'
        ? t('composer.reasoningMax')
        : t('composer.reasoningHigh')

  const anchorFor = (element: HTMLElement): MenuAnchor => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left, y: rect.bottom + 4 }
  }

  return (
    <div className="composer-dock">
      {banner && (
        <div className={`banner ${banner.kind}`} style={{ maxWidth: 720, margin: '0 auto 6px' }}>
          <Icon name={banner.kind === 'error' ? 'alert' : 'info'} size={13} />
          <span className="grow">{banner.text}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('common.close')}
            onClick={() => setBanner(null)}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      <div className="composer">
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((attachment, index) => (
              <span className="attach-file" key={`${attachment.name}-${index}`}>
                <Icon name={attachment.kind === 'image' ? 'image' : 'file'} size={12} />
                <span className="name">{attachment.name}</span>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 18, height: 18 }}
                  aria-label={t('common.delete')}
                  onClick={() => setAttachments((current) => current.filter((_a, i) => i !== index))}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <ContextStrip
          mode={effectiveMode}
          conversationId={currentId}
          onEdit={() => setContextOpen(true)}
        />

        <textarea
          ref={textarea}
          className="composer-input"
          value={draft}
          placeholder={isAgent ? t('composer.placeholderAgent') : t('composer.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => void onPaste(event)}
          rows={1}
          spellCheck={false}
        />

        <div className="composer-bar">
          {/* Agent 会话的模式锁定：不能切出，也不能把已有会话切进 Agent */}
          {modeLocked ? (
            <span className="pill locked" title={t('composer.modeLocked')}>
              <span className="label">{t(`mode.${effectiveMode}`)}</span>
            </span>
          ) : (
            <button
              type="button"
              className="pill"
              title={t('composer.mode')}
              onClick={(event) => setMenu({ kind: 'mode', anchor: anchorFor(event.currentTarget) })}
            >
              <Icon
                name={effectiveMode === 'ROLEPLAY' ? 'sparkles' : 'edit'}
                size={13}
              />
              <span className="label">{t(`mode.${effectiveMode}`)}</span>
            </button>
          )}

          <button
            type="button"
            className="pill"
            title={t('composer.attach')}
            aria-label={t('composer.attach')}
            onClick={(event) => setMenu({ kind: 'attach', anchor: anchorFor(event.currentTarget) })}
          >
            <Icon name="paperclip" size={14} />
          </button>

          <button
            type="button"
            className="pill"
            onClick={(event) => setMenu({ kind: 'model', anchor: anchorFor(event.currentTarget) })}
            title={t('composer.model')}
          >
            <Icon name="zap" size={13} />
            <span className="label">
              {settings.api.model || t('composer.model')} · {reasoningLabel}
            </span>
          </button>

          {compaction ? (
            <button
              type="button"
              className="pill on"
              title={t('composer.compacted')}
              onClick={() => void clearCompaction()}
            >
              <Icon name="layers" size={13} />
              <span className="label">{t('composer.compactedShort')}</span>
            </button>
          ) : (
            messageCount > 6 && (
              <button
                type="button"
                className="pill"
                title={compacting ? t('composer.compacting') : t('composer.compact')}
                aria-label={t('composer.compact')}
                disabled={compacting || streaming}
                onClick={() => void compact()}
              >
                <Icon name="layers" size={13} />
              </button>
            )
          )}

          <span className="spacer" />

          <button
            type="button"
            className="send-btn"
            onClick={() => (streaming ? void stop() : submit())}
            disabled={!streaming && !canSend}
            title={streaming ? t('composer.stop') : t('composer.send')}
            aria-label={streaming ? t('composer.stop') : t('composer.send')}
          >
            <Icon name={streaming ? 'stop' : 'send'} size={15} />
          </button>
        </div>
      </div>

      {settings.ui.showTokenRing && (<div className="composer-meta">
        <span>
          {metrics.replies} {t('status.replies')}
        </span>
        <span>·</span>
        <span title={`${formatTokens(used)} / ${formatTokens(metrics.window)}`}>
          {formatTokens(used)} tok
        </span>
        <span>·</span>
        <span
          style={
            ratio > 0.92
              ? { color: 'var(--oc-error)' }
              : ratio > 0.72
                ? { color: 'var(--oc-warning)' }
                : undefined
          }
        >
          {formatContextPercent(ratio)}
        </span>
        {streaming && (
          <>
            <span>·</span>
            <span>{t('status.streaming')}</span>
          </>
        )}
      </div>)}

      <Menu
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        footer={
          menu?.kind === 'model' ? (
            <>
              {(['off', 'high', 'max'] as ReasoningLevel[]).map((level) => (
                <MenuItem
                  key={level}
                  icon={settings.api.thinking === level ? 'check' : undefined}
                  onClick={() => {
                    setMenu(null)
                    patch((current) => ({ ...current, api: { ...current.api, thinking: level } }))
                  }}
                >
                  {level === 'off'
                    ? t('composer.reasoningOff')
                    : level === 'max'
                      ? t('composer.reasoningMax')
                      : t('composer.reasoningHigh')}
                </MenuItem>
              ))}
            </>
          ) : null
        }
      >
        {menu?.kind === 'mode' && (
          <>
            {modeOptions.map((value) => (
              <MenuItem
                key={value}
                icon={effectiveMode === value ? 'check' : undefined}
                onClick={() => {
                  setMenu(null)
                  if (conversation) {
                    void cmd
                      .updateConversation(conversation.id, { mode: value })
                      .then(() => useChatStore.getState().reloadConversations())
                  } else {
                    setMode(value)
                  }
                  // 切到扮演 / 创作且还没选资料：直接把选择器打开
                  if (value !== 'AGENT' && (getAgentSessionContext(currentId)?.characterIds.length ?? 0) === 0) {
                    setContextOpen(true)
                  }
                }}
              >
                {t(`mode.${value}`)}
              </MenuItem>
            ))}

          </>
        )}

        {menu?.kind === 'attach' && (
          <>
            <MenuItem
              icon="image"
              onClick={() => {
                setMenu(null)
                void pickFiles('image')
              }}
            >
              {t('composer.attachImage')}
            </MenuItem>
            <MenuItem
              icon="file"
              onClick={() => {
                setMenu(null)
                void pickFiles('file')
              }}
            >
              {t('composer.attachDoc')}
            </MenuItem>
          </>
        )}

        {menu?.kind === 'model' && (
          <>
            {models.length === 0 && <div className="px-3 py-1 text-[12px] text-ink-faint">{t('settings.modelHint')}</div>}
            {models.map((model) => (
              <MenuItem
                key={model.id}
                icon={model.id === settings.api.model ? 'check' : undefined}
                onClick={() => {
                  setMenu(null)
                  patch((current) => ({ ...current, api: { ...current.api, model: model.id } }))
                }}
              >
                {model.displayName}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      <ContextDialog
        open={contextOpen}
        mode={effectiveMode}
        value={sessionContext}
        onClose={() => setContextOpen(false)}
        onSave={(next) => {
          setAgentSessionContext(currentId, next)
          setContextVersion((value) => value + 1)
          setContextOpen(false)
        }}
      />
    </div>
  )
}
