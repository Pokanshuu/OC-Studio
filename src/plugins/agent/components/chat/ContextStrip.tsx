'use client'

/**
 * 输入框上方那一排「本场资料」tag。
 *
 * 扮演：角色 tag（第一个是主角）+「选择角色」；创作再加作品 tag 与「可写回」开关。
 * 点 tag 打开选择器；`×` 只移除自己。agent 模式不显示 —— 它本来就是全库读写。
 */

import { useEffect, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import {
  describeAgentSessionContext,
} from '@/plugins/agent/host/session-context'
import {
  emptyAgentSessionContext,
  getAgentSessionContext,
  setAgentSessionContext,
  type AgentSessionContext,
} from '@/lib/plugins/agent-session'
import { useT } from '@/plugins/agent/i18n'
import type { ConversationMode } from '@/plugins/agent/core/types'

export function ContextStrip({
  mode,
  conversationId,
  onEdit,
}: {
  mode: ConversationMode
  conversationId: string | null
  onEdit: () => void
}) {
  const t = useT()
  const [context, setContext] = useState<AgentSessionContext | null>(null)
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    const next = getAgentSessionContext(conversationId)
    setContext(next)
    if (!next) {
      setNames([])
      return
    }
    let alive = true
    void describeAgentSessionContext(next).then((list) => {
      if (alive) setNames(list)
    })
    return () => {
      alive = false
    }
  }, [conversationId, mode])

  if (mode === 'AGENT') return null

  const creative = mode === 'CREATIVE'
  const characterCount = context?.characterIds.length ?? 0
  const hasNovel = context?.novelRootId != null

  const removeCharacter = (index: number) => {
    if (!context) return
    const ids = context.characterIds.filter((_, position) => position !== index)
    const next: AgentSessionContext = { ...context, characterIds: ids }
    setAgentSessionContext(conversationId, next)
    setContext(next)
    setNames((current) => current.filter((_, position) => position !== index))
  }

  const toggleWritable = () => {
    if (!context) return
    const next: AgentSessionContext = { ...context, novelWritable: !context.novelWritable }
    setAgentSessionContext(conversationId, next)
    setContext(next)
  }

  const removeNovel = () => {
    if (!context) return
    const next: AgentSessionContext = { ...context, novelRootId: null, novelWritable: false }
    setAgentSessionContext(conversationId, next)
    setContext(next)
    setNames((current) => current.slice(0, context.characterIds.length))
  }

  const empty = characterCount === 0 && !hasNovel

  return (
    <div className="composer-context">
      <span className="composer-context-label">{t(`mode.${mode}`)}</span>

      {names.slice(0, characterCount).map((name, index) => (
        <span key={`${name}-${index}`} className={`context-tag${index === 0 ? ' primary' : ''}`}>
          <button type="button" className="context-tag-main" title={t('context.character')} onClick={onEdit}>
            <span className="truncate">{name}</span>
          </button>
          <button
            type="button"
            className="context-tag-x"
            aria-label={t('common.delete')}
            onClick={() => removeCharacter(index)}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}

      {creative && hasNovel ? (
        <span className="context-tag primary">
          <button type="button" className="context-tag-main" title={t('context.novel')} onClick={onEdit}>
            <Icon name="book" size={11} />
            <span className="truncate">{names[characterCount] ?? t('context.pickNovel')}</span>
          </button>
          <button
            type="button"
            className="context-tag-x"
            aria-label={t('common.delete')}
            onClick={removeNovel}
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ) : null}

      {/* 角色和作品是同一个选择器：空的时候只留一个入口，别并排两个「选择…」 */}
      <button
        type="button"
        className="context-tag add"
        onClick={onEdit}
        aria-label={creative ? t('context.pick') : t('context.pickCharacter')}
      >
        <Icon name="plus" size={11} />
        {empty ? (creative ? t('context.pick') : t('context.pickCharacter')) : null}
      </button>

      {creative && hasNovel ? (
        <button
          type="button"
          className={`context-tag${context?.novelWritable ? ' on' : ''}`}
          title={t('context.writableHint')}
          onClick={toggleWritable}
        >
          <Icon name="edit" size={11} />
          {t('context.writable')}
        </button>
      ) : null}
    </div>
  )
}

/** 清空当前会话的资料（新建会话时用） */
export function clearAgentSessionContext(conversationId: string | null): void {
  setAgentSessionContext(conversationId, emptyAgentSessionContext())
}
