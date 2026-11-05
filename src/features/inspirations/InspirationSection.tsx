'use client'

/**
 * 灵感页：左边一列随手记，右边一个编辑器。
 *
 * 为什么是「列表 + 编辑器」而不是卡片流：灵感是**一条一条往下记**的，
 * 卡片流适合有封面的东西（角色 / 国家），灵感没有封面也不该有。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Lightbulb, Plus, Sparkles, Trash2 } from 'lucide-react'
import { EditorCore } from '@/components/editor/EditorCore'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE, ICON_BTN, TITLE_INPUT } from '@/lib/ui-tokens'
import { newWorldEntryData } from '@/lib/entity-defaults'
import { createEntry, saveEntryContent } from '@/features/world/services'
import { useNavigation } from '@/components/layout/NavigationContext'
import {
  createInspiration,
  deleteInspiration,
  loadInspirations,
  markPromoted,
  updateInspiration,
  useInspirations,
} from './store'
import { inspirationLabel, inspirationText, type Inspiration } from './types'

const SAVE_DELAY_MS = 600

function formatDay(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay) return time
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function InspirationSection() {
  const items = useInspirations()
  const { setActiveItem } = useNavigation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [promotedTitle, setPromotedTitle] = useState<string | null>(null)

  const editorRef = useRef<Editor | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<{ id: string; content: string } | null>(null)
  const selectedRef = useRef<string | null>(null)

  useEffect(() => {
    void loadInspirations()
  }, [])

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  // 选中项换了（或第一次到达）：把标题同步进输入框。
  // 标题是**受控输入**，得有一份本地副本；这份副本只能由「换了一条」来驱动，
  // 否则每敲一个字都会把光标顶回去。
  useEffect(() => {
    selectedRef.current = selected?.id ?? null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部选中项 → 本地受控输入，是刻意的单向同步
    setTitle(selected?.title ?? '')
  }, [selected?.id, selected?.title])

  const flush = useCallback(async () => {
    const pending = pendingContent.current
    if (pending === null) return
    pendingContent.current = null
    try {
      await updateInspiration(pending.id, { content: pending.content }, { silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [])

  // 离开页面时把没落盘的最后一个字符写完（不能 await，只能尽力而为）
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      void flush()
    }
  }, [flush])

  const scheduleContentSave = useCallback(
    (id: string, content: string) => {
      pendingContent.current = { id, content }
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        void flush()
      }, SAVE_DELAY_MS)
    },
    [flush],
  )

  const handleCreate = useCallback(async () => {
    try {
      const item = await createInspiration()
      setSelectedId(item.id)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建失败')
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (selected === null) return
    const next = items.find((item) => item.id !== selected.id) ?? null
    try {
      await deleteInspiration(selected.id)
      setSelectedId(next?.id ?? null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }, [items, selected])

  /**
   * 变成笔记：灵感是草稿，定下来的东西该进设定集。
   *
   * 两跳都走已有的正确通道，不新开写路径：
   *   1. `createEntry` 建条目（写操作日志、维护索引）
   *   2. `saveEntryContent` 写正文 —— 它写的是 `document`，不是退役的 `content`
   * 正文直接取**当前编辑器实例**的 JSON，不经过 HTML 往返，格式原样保留。
   */
  const handlePromote = useCallback(async () => {
    if (selected === null) return
    const doc = editorRef.current?.getJSON()
    if (doc === undefined) {
      setError('编辑器还没准备好')
      return
    }
    try {
      await flush()
      const title = inspirationLabel(selected)
      const entryId = await createEntry({ ...newWorldEntryData(), title })
      await saveEntryContent(entryId, title, doc)
      await markPromoted(selected.id, entryId)
      setError(null)
      setPromotedTitle(title)
    } catch (err) {
      setError(err instanceof Error ? err.message : '变成笔记失败')
    }
  }, [flush, selected])

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value)
      if (selected === null) return
      const id = selected.id
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        void updateInspiration(id, { title: value }, { silent: true }).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : '保存失败')
        })
      }, SAVE_DELAY_MS)
    },
    [selected],
  )

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleContentChange = useCallback(
    (content: string) => {
      const id = selectedRef.current
      if (id === null) return
      scheduleContentSave(id, content)
    },
    [scheduleContentSave],
  )

  if (items.length === 0) {
    return (
      <div className={CENTER_STATE}>
        <Lightbulb size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">还没有灵感</p>
        <button type="button" className={BTN_PRIMARY} onClick={() => void handleCreate()}>
          记一条
        </button>
        {error !== null ? <p className="text-xs text-ink-faint">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[220px] shrink-0 flex-col border-r border-line">
        <div className="flex h-12 shrink-0 items-center justify-between px-3">
          <span className="text-[11px] tracking-[0.06em] text-ink-faint">灵感</span>
          <button type="button" className={ICON_BTN} onClick={() => void handleCreate()} title="记一条">
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {items.map((item: Inspiration) => {
            const active = item.id === selected?.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`mb-0.5 flex w-full flex-col items-start gap-0.5 rounded-item px-2 py-1.5 text-left transition-colors ${
                    active ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
                  }`}
                >
                  <span className="w-full truncate text-[13px] text-ink">{inspirationLabel(item)}</span>
                  <span className="w-full truncate text-[11px] text-ink-faint">
                    {formatDay(item.updatedAt)}
                    {inspirationText(item.content) === '' ? '' : ` · ${inspirationText(item.content).slice(0, 18)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected === null ? (
          <div className={CENTER_STATE}>
            <p className="text-sm text-ink-muted">选一条，或者记一条新的</p>
          </div>
        ) : (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 px-4">
              <input
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="标题"
                className={`${TITLE_INPUT} min-w-0 flex-1`}
              />
              <button
                type="button"
                className={BTN_QUIET}
                onClick={() => void handlePromote()}
                title="变成笔记"
              >
                <Sparkles size={13} strokeWidth={2} />
                变成笔记
              </button>
              <button type="button" className={ICON_BTN} onClick={() => void handleDelete()} title="删除">
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
            {selected.promotedId !== undefined || promotedTitle !== null ? (
              <div className="flex items-center gap-2 px-4 pb-1 text-[11px] text-ink-faint">
                <span>已变成笔记「{promotedTitle ?? inspirationLabel(selected)}」</span>
                <button
                  type="button"
                  className="transition-colors hover:text-ink"
                  onClick={() => setActiveItem('世界观')}
                >
                  打开
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <EditorCore
                key={selected.id}
                content={selected.content}
                plain
                placeholder="想到什么写什么"
                onReady={handleEditorReady}
                onContentChange={handleContentChange}
              />
            </div>
            {error !== null ? <p className="px-4 pb-2 text-xs text-ink-faint">{error}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}
