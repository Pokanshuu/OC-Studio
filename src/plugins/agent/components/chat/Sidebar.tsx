/**
 * Conversation sidebar.
 *
 * No separator line to the content panel (the panel's own border is the single
 * rule in the window); rows are full-width bars whose padding comes from the row
 * itself, so hover fills edge to edge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import {
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  relativeTime,
  type MenuAnchor,
} from '@/plugins/agent/components/ui/primitives'
import { useChatStore } from '@/plugins/agent/state/chat'
import { useLang, useT } from '@/plugins/agent/i18n'
import { useVault } from '@/lib/vault/vault-provider'
import { cmd } from '@/plugins/agent/api/bridge'
import type { Conversation, SearchHit } from '@/plugins/agent/core/types'

interface Group {
  label: string
  items: Conversation[]
}

function groupConversations(
  conversations: Conversation[],
  labels: { pinned: string; today: string; yesterday: string; earlier: string },
): Group[] {
  const pinned: Conversation[] = []
  const today: Conversation[] = []
  const yesterday: Conversation[] = []
  const earlier: Conversation[] = []

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000

  for (const conversation of conversations) {
    if (conversation.pinned) {
      pinned.push(conversation)
      continue
    }
    if (conversation.updatedAt >= startOfToday) today.push(conversation)
    else if (conversation.updatedAt >= startOfYesterday) yesterday.push(conversation)
    else earlier.push(conversation)
  }

  return [
    { label: labels.pinned, items: pinned },
    { label: labels.today, items: today },
    { label: labels.yesterday, items: yesterday },
    { label: labels.earlier, items: earlier },
  ].filter((group) => group.items.length > 0)
}

function highlight(snippet: string, start: number, length: number) {
  if (!snippet || length <= 0) return snippet
  const before = snippet.slice(0, start)
  const match = snippet.slice(start, start + length)
  const after = snippet.slice(start + length)
  return (
    <>
      {before}
      <span style={{ background: 'var(--oc-paper-card)', color: 'var(--oc-ink)' }}>{match}</span>
      {after}
    </>
  )
}

export function Sidebar({
  onToggle,
  onOpenSettings,
  onStartResize,
  onResetWidth,
}: {
  onToggle: () => void
  onOpenSettings: () => void
  onStartResize: () => void
  onResetWidth: () => void
}) {
  const t = useT()
  const lang = useLang()

  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const { root: vaultRoot } = useVault()
  // 会话按笔记库隔离：`workspace` 是建会话时的库根。别的库的会话不列出来，
  // 免得在一个世界里点开另一个世界的聊天。没有 workspace 的老会话照常显示。
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => !conversation.workspace || conversation.workspace === vaultRoot),
    [conversations, vaultRoot],
  )
  const visibleIds = useMemo(
    () => new Set(visibleConversations.map((conversation) => conversation.id)),
    [visibleConversations],
  )
  const selectConversation = useChatStore((s) => s.selectConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const togglePin = useChatStore((s) => s.togglePin)
  const deleteConversation = useChatStore((s) => s.deleteConversation)

  const [menu, setMenu] = useState<{ conversation: Conversation; anchor: MenuAnchor } | null>(null)
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [confirming, setConfirming] = useState<Conversation | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // 搜索结果也只留当前笔记库的会话（命中行里没有 workspace，用 id 查）
  const visibleHits = useMemo(
    () => hits.filter((hit) => visibleIds.has(hit.conversationId)),
    [hits, visibleIds],
  )

  const groups = useMemo(
    () =>
      groupConversations(visibleConversations, {
        pinned: t('conv.pinned'),
        today: t('conv.today'),
        yesterday: t('conv.yesterday'),
        earlier: t('conv.earlier'),
      }),
    [visibleConversations, t],
  )

  const runSearch = useCallback(async (text: string) => {
    const term = text.trim()
    if (!term) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      setHits(await cmd.search(term, 40))
    } catch {
      setHits([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), 180)
    return () => clearTimeout(timer)
  }, [query, runSearch])

  const renderItem = (conversation: Conversation) => (
    <div
      key={conversation.id}
      className={`conv-item${conversation.id === currentId ? ' active' : ''}`}
      onClick={() => void selectConversation(conversation.id)}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ conversation, anchor: { x: event.clientX, y: event.clientY } })
      }}
    >
      <div className="conv-main">
        <div className="conv-title">{conversation.title}</div>
        <div className="conv-sub">{relativeTime(conversation.updatedAt, lang)}</div>
      </div>
      <div className="conv-trailing">
        <IconButton
          icon="more"
          label={t('common.select')}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            setMenu({ conversation, anchor: { x: rect.left, y: rect.bottom + 4 } })
          }}
        />
      </div>
    </div>
  )

  return (
    <aside className="sidebar">
      <div
        className="sidebar-resize"
        onPointerDown={(event) => {
          event.preventDefault()
          onStartResize()
        }}
        onDoubleClick={onResetWidth}
        role="separator"
        aria-orientation="vertical"
      />

      <div className="sidebar-top">
        <IconButton icon="chevron-left" label={t('nav.collapse')} onClick={onToggle} className="lg" />
        <h2 className="sidebar-title">{t('nav.conversations')}</h2>
        <span className="grow" />
        <IconButton
          icon="plus"
          label={t('nav.newChat')}
          onClick={() => void newConversation()}
          className="lg"
        />
      </div>

      <div className="search-box">
        <div className="search-input-wrap">
          <Icon name="search" size={13} />
          <input
            ref={searchRef}
            className="input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('')
                searchRef.current?.blur()
              }
            }}
          />
        </div>
      </div>

      <div className="sidebar-scroll">
        {query.trim().length > 0 ? (
          <>
            {searching && <div className="sidebar-section">{t('common.loading')}</div>}
            {!searching && visibleHits.length === 0 && (
              <div className="sidebar-section">{t('search.empty')}</div>
            )}
            {visibleHits.map((hit) => (
              <div
                key={hit.conversationId}
                className={`conv-item${hit.conversationId === currentId ? ' active' : ''}`}
                onClick={() => void selectConversation(hit.conversationId)}
              >
                <div className="conv-main">
                  <div className="conv-title">{hit.title}</div>
                  {hit.snippet && (
                    <div className="conv-sub" style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>
                      {highlight(hit.snippet, hit.matchStart, hit.matchLen)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {groups.length === 0 && <div className="sidebar-section">{t('conv.empty')}</div>}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="sidebar-section">{group.label}</div>
                {group.items.map(renderItem)}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="conv-item" onClick={onOpenSettings}>
          <Icon name="settings" size={15} />
          <div className="conv-main">
            <div className="conv-title">{t('nav.settings')}</div>
          </div>
        </div>
      </div>

      <Menu anchor={menu?.anchor ?? null} onClose={() => setMenu(null)}>
        <MenuItem
          icon="pin"
          onClick={() => {
            if (menu) void togglePin(menu.conversation.id)
            setMenu(null)
          }}
        >
          {menu?.conversation.pinned ? t('conv.unpin') : t('conv.pin')}
        </MenuItem>
        <MenuItem
          icon="edit"
          onClick={() => {
            if (menu) {
              setTitleDraft(menu.conversation.title)
              setRenaming(menu.conversation)
            }
            setMenu(null)
          }}
        >
          {t('conv.rename')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon="trash"
          danger
          onClick={() => {
            if (menu) setConfirming(menu.conversation)
            setMenu(null)
          }}
        >
          {t('conv.delete')}
        </MenuItem>
      </Menu>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('conv.rename')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn quiet" onClick={() => setRenaming(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!titleDraft.trim()}
              onClick={() => {
                if (renaming) void renameConversation(renaming.id, titleDraft)
                setRenaming(null)
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
            if (event.key === 'Enter' && titleDraft.trim() && renaming) {
              void renameConversation(renaming.id, titleDraft)
              setRenaming(null)
            }
          }}
        />
      </Dialog>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t('conv.delete')}
        footer={
          <>
            <span className="spacer" />
            <button className="btn quiet" onClick={() => setConfirming(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (confirming) void deleteConversation(confirming.id)
                setConfirming(null)
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
    </aside>
  )
}
