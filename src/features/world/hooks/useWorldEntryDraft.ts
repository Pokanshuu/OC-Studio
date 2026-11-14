'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { saveEntryContent } from '../services'
import { syncReferenceLabels } from '@/lib/reference-sync'
import { hasWorldBody, loadBodyWithoutHistory, worldBodyOf } from '@/lib/world-body'
import { registerPendingSave } from '@/lib/pending-saves'
import { snapshotKey } from '@/lib/dirty'
import { editorContentOf } from '@/components/editor/editor-content'
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
 * 老库的 `content` 可能是纯文本 / Markdown 字符串（novel 早期版本就这么存）。
 * Tiptap 的 `setContent(string)` 会把它当 **HTML** —— 于是 `**` / `[[ ]]` 原样
 * 显示、段落塌成一条。这里先走一次 Markdown 解析，再灌进编辑器。
 */
function loadableBody(entry: WorldEntry): object | string {
  return editorContentOf(worldBodyOf(entry))
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 词条正文与标题的「草稿 → 落库」管线。
 *
 * 三件事：编辑器实例里取 JSON；标题/正文变更合并成一次防抖写入（1s）；
 * 切换词条、页面卸载（beforeunload）、关窗 / 换库时把待写内容 flush 掉。
 * 关闭 `saveEnabledRef` 的窗口期用来避免「刚 setContent 就被当成用户编辑」。
 *
 * 保存失败**向上抛出**（不再只写 console）：自动保存弹一次错误，离场屏障会拦住关闭 /
 * 换库。await 期间又攒下的新草稿会保留在 `pendingSaveRef` 里，由下一轮继续写。
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
  /** 串行链：同一时刻只允许一次词条写入，否则后完成的旧草稿会盖掉新草稿 */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  /**
   * 最近几次**自己**写进库里的正文签名（按词条 id 分组）。
   *
   * 保存成功后会 `refresh()`，查询回传的就是刚提交的这一版。它既不是外部编辑，
   * 也不该把 await 期间用户继续输入的内容灌回去 —— 必须能认出来并跳过。
   * 保留最近几次而不是只留一次：连续保存两次时，查询可能先回传较旧的那一版。
   */
  const ownSaveEchoRef = useRef<{ entryId: number | null; keys: { key: string; updatedAt?: number }[] }>({
    entryId: null,
    keys: [],
  })
  /** 编辑器里当前装载的是哪条词条 —— 换条目时必须装载，不能被“自己的回执”挡住 */
  const editorEntryIdRef = useRef<number | null>(null)
  /**
   * 上一次**已经广播过**的标题。
   *
   * 词条名会出现在别处（地图锚点标签、相册来源、关系图节点）。标题输入框每敲一个字都会
   * 触发防抖保存 —— 不能每个字都广播（相册要扫全库），所以在**保存落地之后**比一次：
   * 标题真的变了才广播，一次改名只播一次。
   */
  const broadcastTitleRef = useRef<string | null>(null)

  const rememberOwnSave = useCallback((entryId: number, body: unknown, updatedAt?: number) => {
    const store = ownSaveEchoRef.current
    if (store.entryId !== entryId) {
      store.entryId = entryId
      store.keys = []
    }
    const key = snapshotKey(body)
    store.keys = [...store.keys.filter((item) => item.key !== key || item.updatedAt !== updatedAt), { key, updatedAt }].slice(-8)
  }, [])

  const isOwnSaveEcho = useCallback((entryId: number, body: unknown, updatedAt: number): boolean => {
    const store = ownSaveEchoRef.current
    if (store.entryId !== entryId) return false
    const key = snapshotKey(body)
    const index = store.keys.findIndex((item) => item.key === key &&
      (item.updatedAt === undefined || item.updatedAt === updatedAt))
    if (index < 0) return false
    // Older adapters without revision receipts get a one-use acknowledgement.
    if (store.keys[index].updatedAt === undefined) store.keys.splice(index, 1)
    return true
  }, [])

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

  const runFlush = useCallback(async () => {
    const pending = pendingSaveRef.current
    if (!pending) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    // 失败先给一句回执再向上抛：调用方（自动保存 / 切换词条 / 离场屏障）必须知道
    // 它没写进去，而用户也不能只看到「点了没反应」。
    let synced: Record<string, unknown>
    let receipt: { updatedAt: number } | undefined
    try {
      synced = await syncReferenceLabels(pending.doc as Record<string, unknown>)
      receipt = await saveEntryContent(pending.entryId, pending.title, synced)
    } catch (error) {
      toast.error('保存失败', { description: errorText(error) })
      throw error
    }
    // 期间若又攒了新草稿就保留它 —— 只清掉刚刚确认提交的这一版
    if (pendingSaveRef.current === pending) pendingSaveRef.current = null
    // 记下“这一版是我自己写的”：refresh 回传时据此跳过回灌
    rememberOwnSave(pending.entryId, synced, receipt?.updatedAt)
    // 名字变了才广播（每次保存最多一次）：地图 / 相册 / 关系图上的旧名要跟着换
    if (broadcastTitleRef.current !== pending.title) {
      broadcastTitleRef.current = pending.title
      notifyDataUpdated()
    }
    refresh()
  }, [refresh, rememberOwnSave])

  /** 串行执行一次 flush（没有待写内容时是空操作） */
  const flushSave = useCallback((): Promise<void> => {
    const next = saveChainRef.current.then(runFlush, runFlush)
    saveChainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    /**
     * 有些调用点只 `void flushSave()`（切词条、卸载兜底）。给这个 Promise 挂一个空的
     * 拒绝处理器，避免「保存失败」变成 unhandled rejection；`await flushSave()` 的
     * 调用方与离场屏障仍然会拿到 rejection（挂处理器不会改变 Promise 本身的结果）。
     */
    next.catch(() => {})
    return next
  }, [runFlush])

  /** 离场屏障：一直写到没有新草稿为止；失败或追不上就抛错，拦住关闭 / 换库 */
  const flushForExit = useCallback(async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
      await flushSave()
      if (pendingSaveRef.current === null) return
    }
    throw new Error('词条正文仍有未保存的改动')
  }, [flushSave])

  const scheduleSave = useCallback((newTitle: string, json: object) => {
    const entryId = selectedIdRef.current
    if (entryId == null) return
    pendingSaveRef.current = { entryId, title: newTitle, doc: json }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      // 失败回执在 runFlush 里统一给（也覆盖「切换词条前 flush」这条路径）
      void flushSave().catch(() => undefined)
    }, 1000)
  }, [flushSave])

  // 关窗 / 换库流程会 await 这里：防抖窗口里的内容不会被计时器带走
  useEffect(() => registerPendingSave(flushForExit), [flushForExit])

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
      editorEntryIdRef.current = entry.id
      loadBodyWithoutHistory(editor, loadableBody(entry))
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [])

  /**
   * 外部数据到达：把当前词条正文灌进编辑器（同样有一段静默期）。
   *
   * 三种情况必须分开，不能一律 `setContent`：
   * 1. **自己的保存回读**：刚提交的那一版由 `refresh()` 回传，跳过 —— 否则 await 期间
   *    用户继续输入的新内容会被旧版本盖掉（Q04）。
   * 2. **换条目**：必须装载目标词条，不能被“自己的回执”或旧条目的脏草稿挡住。
   * 3. **真正的外部修改**：本地没有未保存草稿时采纳；有脏草稿时保留本地内容，
   *    不能把用户正在写的东西回灌成旧版本。
   */
  useEffect(() => {
    const editor = editorRef.current
    if (!currentEntry || !editor || currentEntry.id !== selectedId) return

    const incoming = loadableBody(currentEntry)
    const switchedEntry = editorEntryIdRef.current !== currentEntry.id

    if (switchedEntry) {
      // 换到一条还有未保存草稿的词条：先显示草稿本身，不能被查询里的旧版本回灌
      const pending = pendingSaveRef.current
      editorEntryIdRef.current = currentEntry.id
      saveEnabledRef.current = false
      loadBodyWithoutHistory(
        editor,
        pending !== null && pending.entryId === currentEntry.id ? pending.doc : incoming,
      )
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
      return
    }

    // 自己刚保存的那一版：不是外部编辑，跳过
    if (isOwnSaveEcho(currentEntry.id, incoming, currentEntry.updatedAt)) return
    // 本地还有这条词条的未保存草稿：外部版本不能覆盖
    const pending = pendingSaveRef.current
    if (pending !== null && pending.entryId === currentEntry.id) return
    // 正文没有变化（只换了标题 / 其它字段）：不做一次无意义的 setContent
    if (snapshotKey(editor.getJSON()) === snapshotKey(incoming)) return

    editorEntryIdRef.current = currentEntry.id
    saveEnabledRef.current = false
    loadBodyWithoutHistory(editor, incoming)
    setTimeout(() => {
      saveEnabledRef.current = true
    }, 300)
  }, [currentEntry, selectedId, isOwnSaveEcho])

  // 关页面前尽量落库（此时不能 await，只能尽力而为）
  useEffect(() => {
    const handler = () => {
      if (pendingSaveRef.current === null) return
      void flushSave().catch((err) => {
        console.error(`[WorldLayout] beforeunload 保存失败:`, err)
      })
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [flushSave])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  return { handleContentChange, handleTitleChange, handleEditorReady, flushSave, selectedIdRef }
}
