'use client'

/**
 * 「这场对话读什么」—— 扮演选一组角色（第一个是主角），创作再选一部小说，
 * 并决定能不能把新章节写回去。
 *
 * 只选「读什么 / 能不能写」，不选「怎么写」：写法是模式自带的人设 + 用户提示词。
 */

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import { Dialog, Switch } from '@/plugins/agent/components/ui/primitives'
import { useT } from '@/plugins/agent/i18n'
import { libraryAccessGranted } from '@/plugins/agent/host/library-tools'
import {
  listAgentCharacters,
  listAgentNovels,
  type AgentCharacterOption,
  type AgentNovelOption,
} from '@/plugins/agent/host/session-context'
import { emptyAgentSessionContext, type AgentSessionContext } from '@/lib/plugins/agent-session'
import type { ConversationMode } from '@/plugins/agent/core/types'

export function ContextDialog({
  open,
  mode,
  value,
  onClose,
  onSave,
}: {
  open: boolean
  mode: ConversationMode
  value: AgentSessionContext | null
  onClose: () => void
  onSave: (context: AgentSessionContext) => void
}) {
  const t = useT()
  const allowed = libraryAccessGranted()
  const creative = mode === 'CREATIVE'

  const [characters, setCharacters] = useState<AgentCharacterOption[]>([])
  const [novels, setNovels] = useState<AgentNovelOption[]>([])
  const [query, setQuery] = useState('')
  const [characterIds, setCharacterIds] = useState<number[]>(value?.characterIds ?? [])
  const [novelRootId, setNovelRootId] = useState<number | null>(value?.novelRootId ?? null)
  const [novelWritable, setNovelWritable] = useState(value?.novelWritable ?? false)

  useEffect(() => {
    if (!open) return
    setCharacterIds(value?.characterIds ?? [])
    setNovelRootId(value?.novelRootId ?? null)
    setNovelWritable(value?.novelWritable ?? false)
    setQuery('')
    if (!allowed) return
    let alive = true
    void listAgentCharacters().then((rows) => {
      if (alive) setCharacters(rows)
    })
    void listAgentNovels().then((rows) => {
      if (alive) setNovels(rows)
    })
    return () => {
      alive = false
    }
  }, [open, value?.characterIds, value?.novelRootId, value?.novelWritable, allowed])

  const visibleCharacters = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-Hans')
    if (!needle) return characters
    return characters.filter((row) => row.name.toLocaleLowerCase('zh-Hans').includes(needle))
  }, [characters, query])

  const toggleCharacter = (id: number) => {
    setCharacterIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('context.title')}
      footer={
        <>
          <span className="spacer" />
          <button className="btn quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!allowed}
            onClick={() => {
              // 连名字一起存：id 是扫描出来的位置号，重排后会指向别的条目，
              // 名字才是身份（见 `resolveAgentSessionContext`）。名字取不全就不存，
              // 宁可按 id 兜一次，也不要写半份对不上的快照。
              const picked = characterIds.map((id) => characters.find((row) => row.id === id)?.name)
              const characterNames = picked.every((name): name is string => typeof name === 'string')
                ? picked
                : undefined
              const novelTitle = novels.find((row) => row.id === novelRootId)?.title
              onSave({
                ...(value ?? emptyAgentSessionContext()),
                characterIds,
                characterNames,
                novelRootId: creative ? novelRootId : null,
                novelTitle: creative ? novelTitle : undefined,
                novelWritable: creative ? novelWritable : false,
              })
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      {!allowed ? (
        <p className="field-hint">{t('context.permission')}</p>
      ) : (
        <>
          <p className="field-hint">{creative ? t('context.creativeHint') : t('context.roleplayHint')}</p>

          <div className="section">
            <div className="section-title">{t('context.character')}</div>
            <input
              className="input"
              value={query}
              placeholder={t('context.pickCharacter')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="pick-list">
              {visibleCharacters.length === 0 ? (
                <div className="pick-empty">{t('context.empty')}</div>
              ) : (
                visibleCharacters.map((row) => {
                  const index = characterIds.indexOf(row.id)
                  const selected = index >= 0
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`pick-row${selected ? ' on' : ''}`}
                      onClick={() => toggleCharacter(row.id)}
                    >
                      <span className="pick-check">
                        {selected ? <Icon name="check" size={13} /> : null}
                      </span>
                      <span className="truncate">{row.name}</span>
                      {index === 0 ? <span className="pick-role">{t('context.primary')}</span> : null}
                    </button>
                  )
                })
              )}
            </div>
            {characterIds.length > 1 ? (
              <p className="field-hint">{t('context.primaryHint')}</p>
            ) : null}
          </div>

          {creative && (
            <div className="section">
              <div className="section-title">{t('context.novel')}</div>
              <div className="pick-list">
                <button
                  type="button"
                  className={`pick-row${novelRootId === null ? ' on' : ''}`}
                  onClick={() => setNovelRootId(null)}
                >
                  <span className="pick-check">
                    {novelRootId === null ? <Icon name="check" size={13} /> : null}
                  </span>
                  <span className="truncate">{t('context.noNovel')}</span>
                </button>
                {novels.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`pick-row${novelRootId === row.id ? ' on' : ''}`}
                    onClick={() => setNovelRootId(row.id)}
                  >
                    <span className="pick-check">
                      {novelRootId === row.id ? <Icon name="check" size={13} /> : null}
                    </span>
                    <span className="truncate">{row.title}</span>
                  </button>
                ))}
              </div>
              {novelRootId !== null ? (
                <div className="field-row">
                  <div>
                    <div className="label">{t('context.writable')}</div>
                    <div className="hint">{t('context.writableHint')}</div>
                  </div>
                  <Switch checked={novelWritable} onChange={setNovelWritable} />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}

/** 没选任何资料时的默认值（给调用方省掉一次判空） */
export function defaultAgentSessionContext(): AgentSessionContext {
  return emptyAgentSessionContext()
}
