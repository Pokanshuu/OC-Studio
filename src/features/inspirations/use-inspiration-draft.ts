'use client'

/**
 * 一条灵感的草稿状态与自动保存 —— 顶栏便签用它（`InspirationQuickNote`）。
 *
 * 「输入 → 防抖 → 落盘」只有这一条路径：灵感里是作者写的字，
 * 保存逻辑再抄一份，迟早有一边悄悄丢字。
 *
 * 约定：
 * - `item` 是**当前打开的那一条**（外部真源）；标题的本地副本只由它驱动，
 *   否则每敲一个字都会把光标顶回去。
 * - 未落盘的改动放在 `pending` 里、**带着 id** —— 切条途中旧条的最后一个字
 *   也写回旧条，不会落到刚打开的那一条上。
 * - 切条 / 关窗 / 删除 / 升级成笔记之前一律先 `flush()`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { updateInspiration } from './store'

const SAVE_DELAY_MS = 600

interface PendingPatch {
  id: string
  title?: string
  content?: string
}

export interface InspirationDraft {
  /** 受控标题的本地副本 */
  title: string
  changeTitle: (value: string) => void
  handleEditorReady: (editor: Editor) => void
  handleContentChange: (content: string) => void
  /** 把还没落盘的字写完 */
  flush: () => Promise<void>
  /** 当前编辑器文档（「变成笔记」用，不经过 HTML 往返） */
  getDocument: () => unknown
}

export function useInspirationDraft(
  item: { id: string; title: string } | null,
  onError?: (message: string) => void,
): InspirationDraft {
  const [title, setTitle] = useState(item?.title ?? '')
  const editorRef = useRef<Editor | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<PendingPatch | null>(null)
  const itemRef = useRef(item)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    itemRef.current = item
    onErrorRef.current = onError
  })

  const report = useCallback((err: unknown) => {
    onErrorRef.current?.(err instanceof Error ? err.message : '保存失败')
  }, [])

  const flush = useCallback(async () => {
    const patch = pending.current
    if (patch === null) return
    pending.current = null
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const draft: { title?: string; content?: string } = {}
    if (patch.title !== undefined) draft.title = patch.title
    if (patch.content !== undefined) draft.content = patch.content
    if (draft.title === undefined && draft.content === undefined) return
    try {
      await updateInspiration(patch.id, draft, { silent: true })
    } catch (err) {
      report(err)
    }
  }, [report])

  /** 攒改动：同一条的标题与正文合并成一次写，防抖窗口共用一个计时器 */
  const queue = useCallback(
    (patch: { title?: string; content?: string }) => {
      const current = itemRef.current
      if (current === null) return
      const base = pending.current
      pending.current =
        base !== null && base.id === current.id
          ? { ...base, ...patch }
          : { id: current.id, ...patch }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void flush()
      }, SAVE_DELAY_MS)
    },
    [flush],
  )

  const changeTitle = useCallback(
    (value: string) => {
      setTitle(value)
      queue({ title: value })
    },
    [queue],
  )

  const handleContentChange = useCallback(
    (content: string) => {
      queue({ content })
    },
    [queue],
  )

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const getDocument = useCallback(() => editorRef.current?.getJSON(), [])

  // 换了一条（或标题被外部改过）：把受控副本对齐过去。
  // 先 flush：旧条最后一个字挂在 pending 里，带着它的 id 走，不会写到新条上。
  useEffect(() => {
    void flush()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部选中项 → 本地受控输入，刻意的单向同步
    setTitle(item?.title ?? '')
  }, [item?.id, item?.title, flush])

  // 卸载前把最后一个字写完（不能 await，只能尽力而为）
  useEffect(() => () => { void flush() }, [flush])

  return useMemo(
    () => ({ title, changeTitle, handleEditorReady, handleContentChange, flush, getDocument }),
    [title, changeTitle, handleEditorReady, handleContentChange, flush, getDocument],
  )
}
