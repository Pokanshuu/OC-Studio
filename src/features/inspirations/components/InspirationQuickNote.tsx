'use client'

/**
 * 顶栏便签：窗口控制按钮左边的一枚小灯泡，点开是一块能拖着走的随手记。
 *
 * 为什么不是「再开一个页面」：灵感是**打断**出来的东西 —— 想到一句就得立刻写下来，
 * 跳转会把正在看的内容弄丢。所以它是浮层：不切板块、不离开当前页。
 *
 * 它就是灵感的**唯一入口**（侧栏那一项已移除）：小窗里列表 ⇄ 单条，
 * 打开时落在最近记的那条，随后可以返回列表翻旧的；定下来的东西用「变成笔记」升级。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { Editor } from '@tiptap/core'
import { ArrowLeft, Lightbulb, Plus, Sparkles, Trash2, X } from 'lucide-react'
import {
  BTN_PRIMARY,
  CENTER_STATE,
  ICON_BTN,
  PANEL_SOLID,
  ROUND_ITEM,
  TITLE_INPUT,
} from '@/lib/ui-tokens'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { notifyDataUpdated } from '@/lib/data-events'
import { newWorldEntryData } from '@/lib/entity-defaults'
import { createInspiration, deleteInspiration, markPromoted, useInspirations } from '../store'
import { inspirationLabel, inspirationText, inspirationTimeLabel, type Inspiration } from '../types'
import { useInspirationDraft } from '../use-inspiration-draft'

/**
 * 编辑器内核按需加载：它带着 TipTap 全家桶，而便签是「想到才点」的东西 ——
 * 为一个 24px 的小按钮把编辑器塞进首启包，代价太贵。
 */
const EditorCore = dynamic(
  () => import('@/components/editor/EditorCore').then((mod) => mod.EditorCore),
  { ssr: false, loading: () => null },
)

const NOTE_WIDTH = 340
const NOTE_HEIGHT = 440
/** 窗框与视口边缘的最小距离（拖到边上就停在这） */
const VIEWPORT_MARGIN = 12

function defaultPosition(): { left: number; top: number } {
  return {
    left: Math.max(VIEWPORT_MARGIN, window.innerWidth - NOTE_WIDTH - 16),
    top: 44,
  }
}

/**
 * 把坐标夹回当前视口。
 *
 * 便签的坐标是**打开时**算的、之后只由拖动改写；窗口从全屏缩回普通尺寸时
 * 坐标还停在屏幕右边，面板就只露出一半（缩得更小就完全看不见）——
 * 看起来像「只有全屏才打得开」。打开时和 resize 时都要过一遍这里。
 * 宽高按面板实际的 `max-width` / `max-height` 收窄，小窗口下也不会算出窗外。
 */
function clampToViewport(position: { left: number; top: number }): { left: number; top: number } {
  const width = Math.min(NOTE_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  const height = Math.min(NOTE_HEIGHT, window.innerHeight - 72)
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
  return {
    left: Math.min(Math.max(VIEWPORT_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(VIEWPORT_MARGIN, position.top), maxTop),
  }
}

interface DragState {
  pointerId: number
  offsetX: number
  offsetY: number
  /** 拖动中最后一次夹取后的坐标（松手时才提交到 state） */
  left?: number
  top?: number
}

export function InspirationQuickNote() {
  const items = useInspirations()
  const { navigateToEntity } = useEntityNavigate()
  const [open, setOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [promoting, setPromoting] = useState(false)
  /** 待确认删除的灵感：非空 = 警告窗打开（照 WorldTree / NovelTree 的删除确认） */
  const [deleteTarget, setDeleteTarget] = useState<Inspiration | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const focusOnReady = useRef(false)

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )
  const showNote = !listOpen && selected !== null
  const draft = useInspirationDraft(showNote ? selected : null, setError)

  const selectItem = useCallback((id: string) => {
    setSelectedId(id)
    setListOpen(false)
    setDeleteTarget(null)
    setError(null)
    focusOnReady.current = true
  }, [])

  const handleCreate = useCallback(async () => {
    try {
      const item = await createInspiration()
      selectItem(item.id)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建失败')
    }
  }, [selectItem])

  const handleDelete = useCallback(async (target: Inspiration) => {
    try {
      // 先写完最后一个字再删，否则防抖计时器会拿旧 id 再写一次
      if (target.id === selectedId) await draft.flush()
      await deleteInspiration(target.id)
      if (selectedId === target.id) {
        setSelectedId(null)
        setListOpen(true)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }, [draft, selectedId])

  const closeWindow = useCallback(() => {
    void draft.flush()
    setDeleteTarget(null)
    setOpen(false)
  }, [draft])

  /**
   * 变成笔记：草稿定下来了，该进设定集。
   *
   * 两跳都走已有的正确通道 —— `createEntry`（写操作日志 / 索引）+
   * `saveEntryContent`（写 `document`，不是退役的 `content`），正文直接取编辑器
   * 实例的 JSON，不经过 HTML 往返。世界编辑器的写入链路按需 import：
   * 便签是首启就在的东西，别为一个不常按的键把那一串模块拉进首启包。
   */
  const handlePromote = useCallback(async () => {
    if (selected === null || promoting) return
    const doc = draft.getDocument()
    if (doc === undefined) {
      setError('编辑器还没准备好')
      return
    }
    setPromoting(true)
    try {
      await draft.flush()
      const { createEntry, saveEntryContent } = await import('@/features/world/services')
      const title = inspirationLabel(selected)
      const entryId = await createEntry({ ...newWorldEntryData(), title })
      await saveEntryContent(entryId, title, doc)
      // 世界观目录是 react-query 缓存（staleTime 30s）：不广播一声，
      // 刚建出来的词条在列表里查不到，「打开」就跳不过去。
      notifyDataUpdated()
      await markPromoted(selected.id, entryId, title)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '变成笔记失败')
    } finally {
      setPromoting(false)
    }
  }, [draft, promoting, selected])

  /**
   * 打开升级出来的那篇词条。
   *
   * 不能直接拿 `promotedId` 跳：id 是扫描时按路径排出来的**位置号**，
   * 换库或增删文件之后它就指向别的条目了。以标题为准重新找一遍：
   * 找得到就用现在这个 id，找不到就明说「原文不在了」，不要跳到别人身上。
   */
  const handleOpenPromoted = useCallback(async () => {
    const entryId = selected?.promotedId
    const entryTitle = selected?.promotedTitle
    if (entryId === undefined && entryTitle === undefined) return
    try {
      const { db } = await import('@/lib/db')
      let target: number | null = null
      if (entryTitle !== undefined) {
        const rows = await db.worldEntries.filter((row) => !row.deleted).toArray()
        target = rows.find((row) => (row.title.trim() || '未命名') === entryTitle)?.id ?? null
      } else if (entryId !== undefined) {
        const row = await db.worldEntries.get(entryId)
        target = row && !row.deleted ? entryId : null
      }
      if (target === null) {
        setError('原先升级出来的笔记已经不在了（可能被删或改过名）')
        return
      }
      closeWindow()
      navigateToEntity(target, 'world')
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开失败')
    }
  }, [closeWindow, navigateToEntity, selected])

  const openWindow = useCallback(() => {
    // 上次的坐标可能是在全屏 / 更大的窗口里留下的，打开前先夹回当前视口
    setPosition((current) => clampToViewport(current ?? defaultPosition()))
    // 点灯泡就是为了写字：即便上次停在列表，也从最近那条接着记
    setListOpen(false)
    setDeleteTarget(null)
    const stillThere = selectedId !== null && items.some((item) => item.id === selectedId)
    if (!stillThere) setSelectedId(items[0]?.id ?? null)
    focusOnReady.current = true
    setOpen(true)
  }, [items, selectedId])

  // 窗口缩小 / 退出全屏时，把已经打开的面板一起收进视口
  useEffect(() => {
    if (!open) return
    const handleResize = () => {
      setPosition((current) => (current === null ? null : clampToViewport(current)))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open])

  const toggle = useCallback(() => {
    if (open) closeWindow()
    else openWindow()
  }, [closeWindow, open, openWindow])

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      draft.handleEditorReady(editor)
      if (!focusOnReady.current) return
      focusOnReady.current = false
      // 等一帧再落光标：编辑器挂载的那一帧还会重排，立刻 focus 会被冲掉
      window.requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        editor.commands.focus('end')
      })
    },
    [draft],
  )

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // 用 Element 而不是 HTMLElement：按钮里的图标是 SVGElement，
    // 用 HTMLElement 判会让「点在图标上」被当成点在空白处 —— 指针被标题栏捕获，
    // 按钮的 click 就永远不触发了（新建 / 返回 / 收起全部失灵）。
    const target = event.target
    if (target instanceof Element && target.closest('button, input, [contenteditable="true"]') !== null) return
    const panel = panelRef.current
    if (panel === null) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }, [])

  const moveDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (drag === null || panel === null || drag.pointerId !== event.pointerId) return
    // 用实测尺寸夹取：小视口下窗宽会被 max-width 收窄，写死常量会算出窗外的坐标
    const rect = panel.getBoundingClientRect()
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN)
    drag.left = Math.min(Math.max(VIEWPORT_MARGIN, event.clientX - drag.offsetX), maxLeft)
    drag.top = Math.min(Math.max(VIEWPORT_MARGIN, event.clientY - drag.offsetY), maxTop)
    // 拖动中**直接写 style、不进 state**：便签里挂着编辑器内核，
    // 每个 pointermove 都 setState 会让整棵树按帧重渲染，拖起来发涩。
    // React 只在 style 的 prop 值变化时才碰 DOM，这条手写值能稳稳留到松手。
    panel.style.left = `${drag.left}px`
    panel.style.top = `${drag.top}px`
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (drag.left !== undefined && drag.top !== undefined) {
      setPosition({ left: drag.left, top: drag.top })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="灵感"
        aria-pressed={open}
        title="灵感"
        className={`${ICON_BTN} ${open ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
      >
        <Lightbulb size={13} strokeWidth={2} />
      </button>

      {open && position !== null
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="灵感"
              className={`pointer-events-auto fixed z-40 flex flex-col overflow-hidden ${PANEL_SOLID}`}
              style={{
                left: position.left,
                top: position.top,
                width: NOTE_WIDTH,
                maxWidth: 'calc(100vw - 24px)',
                height: `min(${NOTE_HEIGHT}px, calc(100vh - 72px))`,
              }}
            >
              <div
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className={`flex h-9 shrink-0 touch-none select-none items-center gap-0.5 border-b border-line px-1.5 [&_button]:cursor-default ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                {showNote ? (
                  <>
                    <button
                      type="button"
                      className={ICON_BTN}
                      title="返回列表"
                      aria-label="返回列表"
                      onClick={() => setListOpen(true)}
                    >
                      <ArrowLeft size={14} strokeWidth={2} />
                    </button>
                    <span className="flex-1" />
                    <button
                      type="button"
                      className={`${ICON_BTN} disabled:opacity-40`}
                      title="变成笔记"
                      aria-label="变成笔记"
                      disabled={promoting}
                      onClick={() => void handlePromote()}
                    >
                      <Sparkles size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={ICON_BTN}
                      title="记一条"
                      aria-label="记一条"
                      onClick={() => void handleCreate()}
                    >
                      <Plus size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={ICON_BTN}
                      title="删除"
                      aria-label="删除"
                      onClick={() => { if (selected !== null) setDeleteTarget(selected) }}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                    <button type="button" className={ICON_BTN} title="收起" aria-label="收起" onClick={closeWindow}>
                      <X size={14} strokeWidth={2} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="px-1 text-[11px] tracking-[0.08em] text-ink-faint">灵感</span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      className={ICON_BTN}
                      title="记一条"
                      aria-label="记一条"
                      onClick={() => void handleCreate()}
                    >
                      <Plus size={14} strokeWidth={2} />
                    </button>
                    <button type="button" className={ICON_BTN} title="收起" aria-label="收起" onClick={closeWindow}>
                      <X size={14} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>

              {showNote && selected !== null ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <input
                    value={draft.title}
                    onChange={(event) => draft.changeTitle(event.target.value)}
                    placeholder="标题"
                    aria-label="灵感标题"
                    className={`${TITLE_INPUT} shrink-0 px-3 pt-2 pb-1`}
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                    <EditorCore
                      key={selected.id}
                      content={selected.content}
                      plain
                      placeholder="想到什么写什么"
                      onReady={handleEditorReady}
                      onContentChange={draft.handleContentChange}
                    />
                  </div>
                  {selected.promotedId !== undefined ? (
                    <div className="flex shrink-0 items-center gap-2 px-3 pb-2 text-[11px] text-ink-faint">
                      <span className="min-w-0 flex-1 truncate">
                        已变成笔记「{selected.promotedTitle ?? inspirationLabel(selected)}」
                      </span>
                      <button
                        type="button"
                        className="shrink-0 transition-colors hover:text-ink"
                        onClick={() => void handleOpenPromoted()}
                      >
                        打开
                      </button>
                    </div>
                  ) : null}
                  {error !== null ? <p className="px-3 pb-2 text-xs text-ink-faint">{error}</p> : null}
                </div>
              ) : items.length === 0 ? (
                <div className={`${CENTER_STATE} min-h-0 flex-1 px-4`}>
                  <Lightbulb size={20} strokeWidth={2} className="text-ink-faint" />
                  <p className="text-sm text-ink-muted">还没有灵感</p>
                  <button type="button" className={BTN_PRIMARY} onClick={() => void handleCreate()}>
                    记一条
                  </button>
                  {error !== null ? <p className="text-xs text-ink-faint">{error}</p> : null}
                </div>
              ) : (
                <>
                  <ul className="min-h-0 flex-1 overflow-y-auto p-1">
                    {items.map((item: Inspiration) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectItem(item.id)}
                          className={`mb-0.5 flex w-full flex-col items-start gap-0.5 ${ROUND_ITEM} px-2 py-1.5 text-left transition-colors hover:bg-[var(--oc-hover)]`}
                        >
                          <span className="flex w-full items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{inspirationLabel(item)}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                              {inspirationTimeLabel(item.updatedAt)}
                            </span>
                          </span>
                          <span className="w-full truncate text-[11px] text-ink-faint">
                            {inspirationText(item.content).slice(0, 40)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {error !== null ? <p className="shrink-0 px-3 pb-2 text-xs text-ink-faint">{error}</p> : null}
                </>
              )}
            </div>,
            document.getElementById('overlay-root') ?? document.body,
          )
        : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条灵感</AlertDialogTitle>
            <AlertDialogDescription>
              灵感没有回收站，删除后不可恢复。已经「变成笔记」的内容不会受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (target !== null) void handleDelete(target)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
