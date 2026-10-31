'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { WorldEntry } from '@/types'
import { saveEntryContent } from '../services'
import { syncReferenceLabels } from '@/lib/reference-sync'
import { parseEditorContent } from '../components/world-content-utils'

/**
 * 待写草稿：内容与它的归属词条 id 绑在一起，避免切换词条时写错地方。
 */
interface PendingSave {
  entryId: number
  title: string
  content: string
}

/**
 * 词条正文与标题的「草稿 → 落库」管线。
 *
 * 三件事：编辑器实例里取 JSON；标题/正文变更合并成一次防抖写入（2s）；
 * 切换词条、页面卸载（beforeunload）、组件卸载时把待写内容 flush 掉。
 * 关闭 `saveEnabledRef` 的窗口期用来避免「刚 setContent 就被当成用户编辑」。
 */
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

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { currentEntryRef.current = currentEntry }, [currentEntry])

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current
    if (!pending) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    try {
      const doc = JSON.parse(pending.content) as Record<string, unknown>
      const synced = await syncReferenceLabels(doc)
      await saveEntryContent(pending.entryId, pending.title, JSON.stringify(synced))
      // 期间若又攒了新草稿就别清掉它
      if (pendingSaveRef.current === pending) pendingSaveRef.current = null
      refresh()
    } catch (err) {
      console.error(`[save] flushSave 写入失败:`, err)
    }
  }, [refresh])

  const scheduleSave = useCallback((newTitle: string, json: object) => {
    const entryId = selectedIdRef.current
    if (entryId == null) return
    const contentStr = JSON.stringify(json)
    pendingSaveRef.current = { entryId, title: newTitle, content: contentStr }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, 2000)
  }, [flushSave])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    if (entry && entry.id === selectedIdRef.current && entry.content) {
      const content = parseEditorContent(entry.content)
      editor.commands.setContent(content)
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [])

  // 外部数据到达：把当前词条正文灌进编辑器（同样有一段静默期）
  useEffect(() => {
    if (currentEntry && editorRef.current && currentEntry.id === selectedId) {
      saveEnabledRef.current = false
      const content = parseEditorContent(currentEntry.content)
      editorRef.current.commands.setContent(content)
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
      void saveEntryContent(pending.entryId, pending.title, pending.content).catch((err) => {
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
