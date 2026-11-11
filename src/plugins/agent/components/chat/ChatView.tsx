/**
 * Conversation pane: page head, message list, sticky scrolling, composer.
 *
 * Scrolling policy: while the viewport is within 80px of the bottom it stays
 * pinned; otherwise new content never yanks the reader away. Switching
 * conversations always jumps to the newest message.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { Dialog, IconButton, Menu, MenuItem, MenuSeparator, type MenuAnchor } from '@/plugins/agent/components/ui/primitives'
import { activePath, siblingCounts, siblingsOf } from '@/plugins/agent/core/messageTree'
import { useChatStore } from '@/plugins/agent/state/chat'
import { useT } from '@/plugins/agent/i18n'
import { useVault } from '@/lib/vault/vault-provider'
import { MessageItem } from './MessageItem'
import { TodoPanel } from './StepTimeline'
import { Composer } from './Composer'
import { ApprovalDialog } from './ApprovalDialog'

const STICK_THRESHOLD = 80
/**
 * 任务清单默认展开；用户折叠过就记住。
 * 以前它只钉在输入区上方、正文不知道它有多高，于是最后一段永远被压在它背后。
 */
const TODOS_OPEN_KEY = 'simple-agent.todos-open'

function readTodosOpen(): boolean {
  try {
    return localStorage.getItem(TODOS_OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

export function ChatView({
  collapsed,
  onToggleSidebar,
}: {
  collapsed: boolean
  onToggleSidebar: () => void
}) {
  const t = useT()
  const allMessages = useChatStore((s) => s.allMessages)
  const streamingId = useChatStore((s) => s.streamingMessageId)
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const todos = useChatStore((s) => s.todos)
  const rename = useChatStore((s) => s.renameConversation)
  const togglePin = useChatStore((s) => s.togglePin)
  const remove = useChatStore((s) => s.deleteConversation)

  const path = useMemo(() => activePath(allMessages), [allMessages])
  const counts = useMemo(() => siblingCounts(allMessages), [allMessages])

  const scrollRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)
  const [todosOpen, setTodosOpen] = useState(readTodosOpen)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const conversation = conversations.find((c) => c.id === currentId) ?? null
  const { root: vaultRoot } = useVault()
  const forkFrom = useChatStore((s) => s.forkFrom)
  /**
   * 别的库的会话只读：消息可以看，工具与输入必须关。
   * 分支会落在**当前库**（`forkFrom` 会改 workspace），这样查看旧库
   * 与在新库继续是两件事，历史不会被悄悄挪库。
   */
  const readOnly = Boolean(conversation?.workspace && conversation.workspace !== vaultRoot)
  const foreignWorkspace = readOnly && conversation?.workspace
    ? (conversation.workspace.split(/[\\/]/).filter(Boolean).pop() ?? conversation.workspace)
    : ''
  const currentWorkspace = vaultRoot
    ? (vaultRoot.split(/[\\/]/).filter(Boolean).pop() ?? vaultRoot)
    : ''
  const lastMessage = path[path.length - 1] ?? null

  /**
   * 输入区栈（任务清单 + Composer）是浮层，正文会在它背后滚。
   * 把它实际高度写进 CSS 变量，`.chat-inner` 的底部留白跟着长：
   * 清单展开时多留一截，折叠 / 附件变化时自动收回，不用写死数字。
   */
  useEffect(() => {
    const stack = stackRef.current
    const scroll = scrollRef.current
    if (!stack || !scroll) return
    const apply = () => {
      scroll.style.setProperty('--composer-height', `${Math.round(stack.offsetHeight)}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(stack)
    return () => observer.disconnect()
  }, [])

  // 清单展开/收起会改变底部留白：贴底时跟着滚一下，否则会停在半空
  useEffect(() => {
    if (!stick) return
    const element = scrollRef.current
    if (!element) return
    const id = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [todosOpen, todos.length, stick])

  const toggleTodos = () => {
    setTodosOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(TODOS_OPEN_KEY, next ? '1' : '0')
      } catch {
        // 隐私模式写不进去：本次会话内仍然生效
      }
      return next
    })
  }

  useEffect(() => {
    setStick(true)
    const element = scrollRef.current
    if (!element) return
    const id = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [currentId])

  useEffect(() => {
    if (!stick) return
    const element = scrollRef.current
    if (!element) return
    const id = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [allMessages, stick])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setStick(distance < STICK_THRESHOLD)
  }

  const scrollToBottom = () => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setStick(true)
  }

  return (
    <>
      <header className="page-head">
        {/* 收起时这里才出现「展开」；展开着的时候开关在会话列表的页头里，
            和宿主列表页（EntityEditorShell / 世界观树）同一个手势。 */}
        {collapsed && (
          <IconButton
            icon="menu"
            label={t('nav.expand')}
            onClick={onToggleSidebar}
          />
        )}
        <button
          type="button"
          className="page-title"
          title={t('conv.rename')}
          onClick={() => {
            if (!conversation) return
            setTitleDraft(conversation.title)
            setRenaming(true)
          }}
        >
          {conversation?.title ?? t('nav.newChat')}
        </button>
        <div className="page-actions">
          {conversation && (
            <IconButton
              icon="more"
              label={t('common.select')}
              onClick={(event) =>
                setMenuAnchor({
                  x: event.currentTarget.getBoundingClientRect().left,
                  y: event.currentTarget.getBoundingClientRect().bottom + 4,
                })
              }
            />
          )}
          {/* 设置只在侧栏收起时出现在这里，避免和侧栏底部那个入口重复 */}
          {collapsed && (
            <IconButton
              icon="settings"
              label={t('nav.settings')}
              onClick={() => window.dispatchEvent(new CustomEvent('simple-agent:open-settings'))}
            />
          )}
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {path.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="chat-inner">
            {path.map((message) => {
              const siblings = siblingsOf(allMessages, message.parentId)
              const index = siblings.findIndex((sibling) => sibling.id === message.id) + 1
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  variantIndex={Math.max(1, index)}
                  variantTotal={counts.get(message.parentId) ?? 1}
                  streaming={streamingId === message.id}
                  canRewrite={conversation?.mode !== 'AGENT' && !readOnly}
                />
              )
            })}
          </div>
        )}
      </div>

      {/*
       * 回到底部按钮钉在「输入区栈」的顶边，而不是面板底部一个写死的 px：
       * 任务清单出现/消失、附件变多时都不用改数字，也不会压住正文中间。
       */}
      {/*
       * 输入区是浮在消息上的：消息可以滚到它背后，被浮层模糊、再被底部渐变吃掉。
       * 之前 composer 是普通流里的兄弟节点，正文永远到不了它下面，模糊等于白做。
       */}
      <div className="chat-fade" aria-hidden="true" />
      <div className="composer-stack" ref={stackRef}>
        {!stick && path.length > 0 && (
          <button
            type="button"
            className="scroll-to-bottom"
            onClick={scrollToBottom}
            title={t('chat.scrollBottom')}
            aria-label={t('chat.scrollBottom')}
          >
            <Icon name="arrow-down" size={14} />
          </button>
        )}

        {todos.length > 0 && (
          <div className="todo-dock">
            <TodoPanel todos={todos} open={todosOpen} onToggle={toggleTodos} />
          </div>
        )}

        {readOnly ? (
          <div className="readonly-dock">
            <div className="readonly-bar">
              <Icon name="info" size={14} />
              <div className="readonly-text">
                <div className="readonly-title">{t('chat.readOnlyTitle')}</div>
                <div className="readonly-hint">
                  {t('chat.readOnlyHint', { name: foreignWorkspace, current: currentWorkspace })}
                </div>
              </div>
              <button
                type="button"
                className="btn sm"
                disabled={!lastMessage}
                onClick={() => {
                  if (lastMessage) void forkFrom(lastMessage.id)
                }}
              >
                {t('chat.branchHere')}
              </button>
            </div>
          </div>
        ) : (
          <Composer />
        )}
      </div>
      <ApprovalDialog />

      <Menu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          icon="edit"
          onClick={() => {
            setMenuAnchor(null)
            if (conversation) {
              setTitleDraft(conversation.title)
              setRenaming(true)
            }
          }}
        >
          {t('conv.rename')}
        </MenuItem>
        <MenuItem
          icon="pin"
          onClick={() => {
            setMenuAnchor(null)
            if (conversation) void togglePin(conversation.id)
          }}
        >
          {conversation?.pinned ? t('conv.unpin') : t('conv.pin')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon="trash"
          danger
          onClick={() => {
            setMenuAnchor(null)
            setConfirmDelete(true)
          }}
        >
          {t('conv.delete')}
        </MenuItem>
      </Menu>

      <Dialog
        open={renaming}
        onClose={() => setRenaming(false)}
        title={t('conv.rename')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn quiet" onClick={() => setRenaming(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!titleDraft.trim()}
              onClick={() => {
                if (conversation) void rename(conversation.id, titleDraft)
                setRenaming(false)
              }}
            >
              {t('common.save')}
            </button>
          </>
        }
      >
        <input
          className="input"
          value={titleDraft}
          autoFocus
          onChange={(event) => setTitleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && titleDraft.trim() && conversation) {
              void rename(conversation.id, titleDraft)
              setRenaming(false)
            }
          }}
        />
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('conv.delete')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn quiet" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (conversation) void remove(conversation.id)
                setConfirmDelete(false)
              }}
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <div className="muted" style={{ fontSize: 13 }}>
          {t('conv.deleteConfirm')}
        </div>
      </Dialog>
    </>
  )
}

function EmptyState() {
  const t = useT()
  const mode = useChatStore((s) => s.mode)
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === s.currentId) ?? null)
  const effective = conversation?.mode ?? mode

  const icon = effective === 'AGENT' ? 'wrench' : effective === 'ROLEPLAY' ? 'sparkles' : 'edit'

  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name={icon} size={16} />
      </div>
      <div className="empty-title">
        {effective === 'AGENT'
          ? t('empty.agent')
          : effective === 'ROLEPLAY'
            ? t('empty.roleplay')
            : t('empty.creative')}
      </div>
      <div className="empty-caption">
        {effective === 'AGENT'
          ? t('empty.agent.caption')
          : effective === 'ROLEPLAY'
            ? t('empty.roleplay.caption')
            : t('empty.creative.caption')}
      </div>
    </div>
  )
}