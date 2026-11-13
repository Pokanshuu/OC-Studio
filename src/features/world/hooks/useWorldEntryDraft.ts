'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { WorldEntry } from '@/types'
import { saveEntryContent } from '../services'
import { syncReferenceLabels } from '@/lib/reference-sync'
import { hasWorldBody, loadBodyWithoutHistory, worldBodyOf } from '@/lib/world-body'
import { registerPendingSave } from '@/lib/pending-saves'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'
import { notifyDataUpdated } from '@/lib/data-events'

/**
 * 待写草稿：内容与它的归属词条 id 绑在一起，避免切换词条时写错地方。
 */
interface PendingSave {
  entryId: number
  title: string
  /** Tiptap 文档对象（不再中途序列化成字符串，见 `lib/world-body.ts`） */
  doc: object
}

/**
 * 词条正文与标题的「草稿 → 落库」管线。
 *
 * 三件事：编辑器实例里取 JSON；标题/正文变更合并成一次防抖写入（2s）；
 * 切换词条、页面卸载（beforeunload）、组件卸载时把待写内容 flush 掉。
 * 关闭 `saveEnabledRef` 的窗口期用来避免「刚 setContent 就被当成用户编辑」。
 */
/**
 * 老库的 `content` 可能是纯文本 / Markdown 字符串（novel 早期版本就这么存）。
 * Tiptap 的 `setContent(string)` 会把它当 **HTML** —— 于是 `**` / `[[ ]]` 原样
 * 显示、段落塌成一条。这里先走一次 Markdown 解析，再灌进编辑器。
 */
function loadableBody(entry: WorldEntry): object | string {
  const body = worldBodyOf(entry)
  if (typeof body !== 'string' || body.trim() === '') return body
  return bodyDocFromMarkdown(body) as object
}

export function useWorldEntryDraft({
  selectedId,
  currentEntry,
  refresh,
  title,
  setTitle,
}: {
  selectedId: number | null
  currentEntry: WorldEntry | undefined
  refresh: () => void
  title: string
  setTitle: (value: string) => void
}) {
  const editorRef = useRef<Editor | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 待写内容连同「它属于哪条词条」一起存：写入目标只认这里记的 id，
  // 不认 selectedIdRef —— 后者在 await 期间可能已经被用户切走，会张冠李戴。
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const saveEnabledRef = useRef(false)
  const currentEntryRef = useRef<WorldEntry | undefined>(undefined)
  /**
   * 上一次**已经广播过**的标题。
   *
   * 词条名会出现在别处（地图锚点标签、相册来源、关系图节点）。标题输入框每敲一个字都会
   * 触发防抖保存 —— 不能每个字都广播（相册要扫全库），所以在**保存落地之后**比一次：
   * 标题真的变了才广播，一次改名只播一次。
   */
  const broadcastTitleRef = useRef<string | null>(null)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { currentEntryRef.current = currentEntry }, [currentEntry])
  /**
   * 切换词条时把「已广播的标题」对齐到盘上/库里的当前标题 ——
   * 否则打开一篇没改名字的笔记、只动了正文，保存时也会因为 ref 是 null 而广播一次，
   * 相册就要白扫一遍全库。
   */
  useEffect(() => {
    broadcastTitleRef.current = currentEntry?.title ?? null
  }, [currentEntry?.id, currentEntry?.title])

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current
    if (!pending) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    try {
      const synced = await syncReferenceLabels(pending.doc as Record<string, unknown>)
      await saveEntryContent(pending.entryId, pending.title, synced)
      // 期间若又攒了新草稿就别清掉它
      if (pendingSaveRef.current === pending) pendingSaveRef.current = null
      // 名字变了才广播（每次保存最多一次）：地图 / 相册 / 关系图上的旧名要跟着换
      if (broadcastTitleRef.current !== pending.title) {
        broadcastTitleRef.current = pending.title
        notifyDataUpdated()
      }
      refresh()
    } catch (err) {
      console.error(`[save] flushSave 写入失败:`, err)
    }
  }, [refresh])

  const scheduleSave = useCallback((newTitle: string, json: object) => {
    const entryId = selectedIdRef.current
    if (entryId == null) return
    pendingSaveRef.current = { entryId, title: newTitle, doc: json }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, 1000)
  }, [flushSave])

  // 关窗流程会 await 这里：800ms 内输入的东西不会被防抖计时器带走
  useEffect(() => registerPendingSave(flushSave), [flushSave])

  const handleContentChange = useCallback((_html: string) => {
    if (!saveEnabledRef.current) return
    if (!editorRef.current) return
    const json = editorRef.current.getJSON()
    scheduleSave(title, json)
  }, [title, scheduleSave])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    if (editorRef.current) {
      const json = editorRef.current.getJSON()
      scheduleSave(newTitle, json)
    }
  }, [scheduleSave, setTitle])

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    saveEnabledRef.current = false
    const entry = currentEntryRef.current
    if (entry && entry.id === selectedIdRef.current && hasWorldBody(entry)) {
      loadBodyWithoutHistory(editor, loadableBody(entry))
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [])

  // 外部数据到达：把当前词条正文灌进编辑器（同样有一段静默期）
  useEffect(() => {
    if (currentEntry && editorRef.current && currentEntry.id === selectedId) {
      saveEnabledRef.current = false
      loadBodyWithoutHistory(editorRef.current, loadableBody(currentEntry))
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [currentEntry, selectedId])

  // 关页面前尽量落库（此时不能 await，只能尽力而为）
  useEffect(() => {
    const handler = () => {
      const pending = pendingSaveRef.current
      if (!pending) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void saveEntryContent(pending.entryId, pending.title, pending.doc).catch((err) => {
        console.error(`[WorldLayout] beforeunload 保存失败:`, err)
      })
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  return { handleContentChange, handleTitleChange, handleEditorReady, flushSave, selectedIdRef }
}
