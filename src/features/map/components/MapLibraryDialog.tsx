'use client'

/**
 * 地图库（桌面）：把 MapSwitcher 的一行卡片展开成「一张地图的档案」。
 *
 * 为什么另开一个弹窗而不是把 MapSwitcher 加宽：快速切换要的是**一行一个名字**，
 * 管理要的是**尺寸 / 锚点数 / 标注数 / 是不是生成图**。两种密度硬塞进一张卡片，
 * 切换时会一直读到管理信息。这里保留低密度的选择器，详情只在「地图库」里出现。
 *
 * 数据都是算的：地图数量、锚点数、标注数都从当前会话里的笔记读出来，
 * 不新增任何表或计数列（`docs/地图.md` §2）。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Library, Map as MapIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
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
import {
  BTN_PRIMARY,
  BTN_QUIET,
  CHIP,
  ICON_BTN,
  INPUT_LINE,
  PANEL,
  PAGE_TITLE,
  ROUND_ITEM,
} from '@/lib/ui-tokens'
import { parseAnnotations } from '../annotations'
import { readMapImageBlob } from '../assets'
import type { MapEntity } from '../services'

interface MapLibraryDialogProps {
  maps: readonly MapEntity[]
  activeId: number | null
  /** 按地图名统计的锚点数（`map_id` 存名字，不存会话 id） */
  anchorCounts: ReadonlyMap<string, number>
  /** `map_id` 为空的旧锚点：它们显示在当前地图上，但不属于任何一张 */
  unassignedAnchors: number
  onClose: () => void
  onSelect: (id: number) => void
  onCreate: () => Promise<void>
  onRename: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function kindLabel(map: MapEntity): string {
  if (map.seed !== undefined) return '生成图'
  if (map.image) return '手绘底图'
  return '还没有底图'
}

function sizeLabel(map: MapEntity): string {
  if (!map.width || !map.height) return '未设尺寸'
  return `${map.width} × ${map.height}`
}

/**
 * 一行地图的缩略预览。
 *
 * 直接用**底图本身**，不另生成缩略图：底图就在 `.ocstudio/maps/` 里，
 * 多存一份只会多一份要同步的东西（这也和改版的 `makeMapThumbnail` 不同 ——
 * 那份是为它的卡片布局生成的内联 data URL，我们是列表行，取原图更省事）。
 * 没有底图的条目给一个占位方块，避免列表高低不齐。
 */
function MapPreview({ reference }: { reference: string | undefined }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!reference) {
      setUrl(null)
      return
    }
    let revoked = false
    let objectUrl: string | null = null
    void readMapImageBlob(reference)
      .then((blob) => {
        if (revoked) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!revoked) setUrl(null)
      })
    return () => {
      revoked = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [reference])

  return (
    <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden border border-line bg-paper-card rounded-item">
      {url === null ? (
        <MapIcon size={14} strokeWidth={2} className="text-ink-faint" />
      ) : (
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
    </span>
  )
}
export function MapLibraryDialog({
  maps,
  activeId,
  anchorCounts,
  unassignedAnchors,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: MapLibraryDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<MapEntity | null>(null)

  // 打开时把焦点收进弹窗、关闭时还给触发按钮
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Esc 关闭；Tab 在弹窗内循环。删除确认开着时交给 AlertDialog 自己处理
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy && deleting === null) {
        onClose()
        return
      }
      if (event.key !== 'Tab' || panelRef.current === null) return
      if (document.querySelector('[data-slot="alert-dialog-content"]') !== null) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, deleting, onClose])

  const submitRename = async (map: MapEntity): Promise<void> => {
    const next = draft.trim()
    if (next === '' || next === map.name) {
      setRenamingId(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onRename(map.id, next)
      setRenamingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (map: MapEntity): Promise<void> => {
    setBusy(true)
    try {
      await onDelete(map.id)
      setDeleting(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const content = (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && deleting === null) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex flex-col overflow-hidden outline-none ${PANEL}`}
        style={{ width: 'min(680px, calc(100vw - 2rem))', maxHeight: '80vh' }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={titleId} className={`flex items-center gap-2 ${PAGE_TITLE}`}>
              <Library size={16} strokeWidth={2} className="text-ink-muted" />
              地图库
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className={`${ICON_BTN} -mr-2 -mt-0.5`}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          {maps.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-ink-faint">还没有地图</p>
          ) : (
            <div className="flex flex-col rules-end">
              {maps.map((map) => {
                const active = map.id === activeId
                const renaming = renamingId === map.id
                const anchors = anchorCounts.get(map.name) ?? 0
                const annotations = parseAnnotations(map.annotations).length
                return (
                  <div
                    key={map.id}
                    className={`row-rule flex items-start gap-2 px-2 py-2.5 transition-colors ${
                      active ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
                    } ${ROUND_ITEM}`}
                  >
                    <MapPreview reference={map.image} />
                    <button
                      type="button"
                      onClick={() => {
                        if (!renaming) onSelect(map.id)
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] text-ink">{map.name}</span>
                        {active ? <span className={CHIP}>当前</span> : null}
                        <span className="shrink-0 text-[11px] text-ink-faint">{kindLabel(map)}</span>
                      </span>
                      <span className="text-[11px] tabular-nums text-ink-faint">
                        {sizeLabel(map)} · {anchors} 个锚点 · {annotations} 条标注
                      </span>
                    </button>

                    {renaming ? (
                      <div className="flex w-56 shrink-0 items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void submitRename(map)
                            if (event.key === 'Escape') setRenamingId(null)
                          }}
                          className={`${INPUT_LINE} h-7`}
                          aria-label={`重命名「${map.name}」`}
                        />
                        <button
                          type="button"
                          onClick={() => void submitRename(map)}
                          disabled={busy}
                          className={ICON_BTN}
                          aria-label="确定"
                        >
                          <Check size={13} strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(map.id)
                            setDraft(map.name)
                            setError('')
                          }}
                          className={ICON_BTN}
                          aria-label={`重命名「${map.name}」`}
                        >
                          <Pencil size={12} strokeWidth={2} />
                        </button>
                        {maps.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setDeleting(map)}
                            className={`${ICON_BTN} hover:text-error`}
                            aria-label={`删除「${map.name}」`}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {unassignedAnchors > 0 ? (
            <p className="mt-2 text-[11px] text-ink-faint">
              另有 {unassignedAnchors} 个锚点未归属地图，暂显示在当前地图
            </p>
          ) : null}

          {error !== '' ? (
            <p role="alert" className="mt-2 text-[12px] text-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className={BTN_QUIET}
          >
            <Plus size={13} strokeWidth={2} />
            新建地图
          </button>
          <button type="button" onClick={onClose} className={`${BTN_PRIMARY} ml-auto`}>
            完成
          </button>
        </div>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除地图</AlertDialogTitle>
            <AlertDialogDescription>
              地图上的锚点会回到主地图，摆过的位置不会丢。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) void remove(deleting) }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}
