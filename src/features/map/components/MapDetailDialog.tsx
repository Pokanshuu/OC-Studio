'use client'

/**
 * 地图详情：一张图的档案 + 出口。**单列**，不跟清单挤在一起。
 *
 * 为什么改回单列：两栏（左清单右档案）在窄窗口 / 样式没跟上时会把右栏挤到折线下面，
 * 用户看到的就是「只有一串地图名」。切换地图本来就有左上名片那条通道，
 * 这里只回答「当前这张图是什么、能对它做什么」。
 *
 * 数字全是算出来的：锚点数按 `map_id`（地图名）统计、标注数解析 `map_annotations`，
 * 不新增任何表或计数列（`docs/地图.md` §2）。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ImageDown, Package, Pencil, RefreshCw, Trash2, X } from 'lucide-react'
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
  FIELD_GRID,
  FIELD_LABEL,
  FIELD_ROW,
  ICON_BTN,
  INPUT_LINE,
  PANEL,
} from '@/lib/ui-tokens'
import { toast } from 'sonner'
import { parseAnnotations } from '../annotations'
import type { MapEntity } from '../services'

interface MapDetailDialogProps {
  map: MapEntity
  /** 这张图上的锚点数（按地图名统计） */
  anchorCount: number
  /** `map_id` 为空的旧锚点：显示在当前地图上，但不属于任何一张 */
  unassignedAnchors: number
  /** 库里只剩一张时不给删 */
  canDelete: boolean
  onClose: () => void
  onRename: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  /** 关掉弹窗、进编辑态 */
  onEdit: () => void
  /** 带着种子与参数打开生成器 */
  onRegenerate: () => void
  onExport: () => Promise<void>
  onExportJpg: () => Promise<void>
  onExportArchive: () => Promise<void>
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

export function MapDetailDialog({
  map,
  anchorCount,
  unassignedAnchors,
  canDelete,
  onClose,
  onRename,
  onDelete,
  onEdit,
  onRegenerate,
  onExport,
  onExportJpg,
  onExportArchive,
}: MapDetailDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const annotations = parseAnnotations(map.annotations).length

  // 打开时把焦点收进弹窗、关闭时还给触发按钮
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Esc 关闭（重命名中先退重命名）
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy || deleting) return
      if (renaming) {
        setRenaming(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, deleting, onClose, renaming])

  const submitRename = async (): Promise<void> => {
    const next = draft.trim()
    if (next === '' || next === map.name) {
      setRenaming(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onRename(map.id, next)
      setRenaming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    try {
      await onDelete(map.id)
      setDeleting(false)
      onClose()
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
        if (event.target === event.currentTarget && !busy && !deleting) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex flex-col overflow-hidden outline-none ${PANEL}`}
        style={{ width: 'min(380px, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 4rem)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-[12px] tracking-[0.08em] text-ink-faint">
            地图详情
          </h2>
          <button type="button" onClick={onClose} aria-label="关闭" className={`${ICON_BTN} -mr-2`}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-serif text-[18px] font-bold tracking-[-0.01em] text-ink">
                {map.name}
              </h3>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                {map.seed !== undefined ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(String(map.seed))
                        .then(() => toast.success('种子已复制'))
                        .catch(() => toast.error('复制失败'))
                    }}
                    className="flex items-center gap-1 tabular-nums transition-colors hover:text-ink"
                    title="复制种子（同种子 = 同一张图）"
                  >
                    seed {map.seed}
                    <Copy size={11} strokeWidth={2} />
                  </button>
                ) : null}
                <span>{kindLabel(map)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRenaming(true)
                setDraft(map.name)
                setError('')
              }}
              className={ICON_BTN}
              aria-label="重命名地图"
              title="重命名"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          </div>

          {renaming ? (
            <div className="mt-3 flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitRename()
                  if (event.key === 'Escape') setRenaming(false)
                }}
                className={INPUT_LINE}
                aria-label="地图名"
              />
              <button
                type="button"
                onClick={() => void submitRename()}
                disabled={busy}
                className={ICON_BTN}
                aria-label="确定"
              >
                <Check size={13} strokeWidth={2} />
              </button>
            </div>
          ) : null}

          <dl className={`mt-4 grid grid-cols-2 gap-x-6 ${FIELD_GRID}`}>
            <div className={FIELD_ROW}>
              <dt className={FIELD_LABEL}>尺寸</dt>
              <dd className="min-w-0 flex-1 truncate text-right text-[13px] tabular-nums text-ink">
                {sizeLabel(map)}
              </dd>
            </div>
            <div className={FIELD_ROW}>
              <dt className={FIELD_LABEL}>类型</dt>
              <dd className="min-w-0 flex-1 truncate text-right text-[13px] text-ink">
                {kindLabel(map)}
              </dd>
            </div>
            <div className={FIELD_ROW}>
              <dt className={FIELD_LABEL}>锚点</dt>
              <dd className="min-w-0 flex-1 truncate text-right text-[13px] tabular-nums text-ink">
                {anchorCount} 个
              </dd>
            </div>
            <div className={FIELD_ROW}>
              <dt className={FIELD_LABEL}>标注</dt>
              <dd className="min-w-0 flex-1 truncate text-right text-[13px] tabular-nums text-ink">
                {annotations} 条
              </dd>
            </div>
          </dl>

          {unassignedAnchors > 0 ? (
            <p className="mt-2 text-[11px] text-ink-faint">
              另有 {unassignedAnchors} 个锚点未归属地图，暂显示在当前地图
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-1.5">
            <button type="button" onClick={onEdit} className={`${BTN_PRIMARY} justify-center`}>
              编辑地图
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={map.seed === undefined}
              className={`${BTN_QUIET} justify-center`}
            >
              <RefreshCw size={13} strokeWidth={2} />
              在生成器中重新生成
            </button>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={!map.image || busy}
              className={`${BTN_QUIET} justify-center`}
            >
              <ImageDown size={13} strokeWidth={2} />
              导出 PNG
            </button>
            <button
              type="button"
              onClick={() => void onExportJpg()}
              disabled={!map.image || busy}
              className={`${BTN_QUIET} justify-center`}
            >
              <ImageDown size={13} strokeWidth={2} />
              导出 JPG
            </button>
            <button
              type="button"
              onClick={() => void onExportArchive()}
              disabled={busy}
              className={`${BTN_QUIET} justify-center`}
            >
              <Package size={13} strokeWidth={2} />
              导出地图包
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDeleting(true)}
            disabled={!canDelete || busy}
            className={`${BTN_QUIET} mt-3 w-full justify-center text-error hover:text-error`}
          >
            <Trash2 size={13} strokeWidth={2} />
            删除地图
          </button>

          {error !== '' ? (
            <p role="alert" className="mt-2 text-[12px] text-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除地图</AlertDialogTitle>
            <AlertDialogDescription>
              地图上的锚点会回到主地图，摆过的位置不会丢。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}
