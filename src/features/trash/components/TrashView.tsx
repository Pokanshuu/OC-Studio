'use client'

import { useState, useCallback, useMemo, useEffect } from "react"
import { Trash2, Undo2, XCircle, X } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { BTN_QUIET, EMPTY_STATE, ICON_BTN, LIST_END, LOADING_TEXT, PAGE_TITLE, ROUND_PANEL } from '@/lib/ui-tokens'
import { useTrash } from "../hooks/useTrash"
import * as trashService from "../services"
import type { TrashItem, TrashItemType } from "../types"
import { notifyDataUpdated } from '@/lib/data-events'

function formatDeleteTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, "0")
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>永久删除</AlertDialogTitle>
          <AlertDialogDescription>
            确认永久删除「{itemName}」？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-error text-paper hover:bg-error"
          >
            永久删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface TrashViewProps {
  onClose: () => void
}

export function TrashView({ onClose }: TrashViewProps) {
  const { items, loading, error, refresh } = useTrash()
  const [confirmTarget, setConfirmTarget] = useState<{ type: TrashItemType; id: number } | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => onClose(), 150)
  }, [onClose])

  const handleRestore = useCallback(
    async (type: TrashItemType, id: number) => {
      const key = type + "-" + String(id)
      setRestoring(key)
      try {
        await trashService.restoreItem(type, id)
        toast("已恢复")
        refresh()
        notifyDataUpdated()
      } catch {
        toast.error("恢复失败")
      } finally {
        setRestoring(null)
      }
    },
    [refresh],
  )

  const handlePermanentDelete = useCallback(
    async (type: TrashItemType, id: number) => {
      try {
        await trashService.permanentlyDeleteItem(type, id)
        toast("已永久删除")
        setConfirmTarget(null)
        refresh()
        notifyDataUpdated()
      } catch {
        toast.error("删除失败")
      }
    },
    [refresh],
  )

  const grouped = useMemo(() => {
    const map: Record<string, TrashItem[]> = {}
    for (const item of items) {
      if (!map[item.typeLabel]) {
        map[item.typeLabel] = []
      }
      map[item.typeLabel].push(item)
    }
    return map
  }, [items])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/15 dark:bg-black/40 transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={`flex max-md:w-[calc(100%-2rem)] max-md:min-h-[40vh] max-md:max-h-[calc(100vh-4rem)] max-md:my-4 h-[80vh] w-[80vw] max-w-5xl flex-col overflow-auto border border-line bg-paper transition-opacity duration-150 ${ROUND_PANEL}`}
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="flex h-12 shrink-0 items-center justify-between sticky top-0 z-10 border-b border-line px-4 bg-paper/85 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <h2 className={PAGE_TITLE}>回收站</h2>
            {items.length > 0 ? (
              <span className="text-[11px] text-ink-faint tabular-nums">
                {items.length} 项
              </span>
            ) : null}
          </div>
          <button onClick={handleClose} className={ICON_BTN} aria-label="关闭回收站">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className={LOADING_TEXT}>加载中…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-error">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className={EMPTY_STATE}>
            <Trash2 size={28} strokeWidth={1.5} className="text-ink-faint" />
            <p className="font-serif text-sm text-ink-faint">回收站为空</p>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex flex-col gap-8">
              {Object.entries(grouped).map(([typeLabel, groupItems]) => (
                <div key={typeLabel}>
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-[11px] tracking-[0.08em] text-ink-faint">{typeLabel}</span>
                    <Separator className="flex-1" />
                  </div>
                  <div className={`flex flex-col ${LIST_END}`}>
                    {groupItems.map((item) => (
                      <div key={item.type + "-" + item.id}
                        className="flex items-center gap-4 border-b border-line px-1 py-2.5"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm text-ink">{item.name}</span>
                          <span className="text-[11px] text-ink-faint">删除于 {formatDeleteTime(item.deletedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRestore(item.type, item.id)}
                            disabled={restoring === item.type + "-" + String(item.id)}
                            className={BTN_QUIET}
                          >
                            <Undo2 size={13} strokeWidth={2} />
                            <span>恢复</span>
                          </button>
                          <button
                            onClick={() => setConfirmTarget({ type: item.type, id: item.id })}
                            className="flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-[13px] text-ink-muted transition-colors hover:text-error"
                          >
                            <XCircle size={13} strokeWidth={2} />
                            <span>永久删除</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ConfirmDeleteDialog
          open={confirmTarget !== null}
          onOpenChange={(open) => { if (!open) setConfirmTarget(null) }}
          itemName={confirmTarget ? (items.find((i) => i.type === confirmTarget.type && i.id === confirmTarget.id)?.name ?? "") : ""}
          onConfirm={() => { if (confirmTarget) { handlePermanentDelete(confirmTarget.type, confirmTarget.id) } }}
        />
      </div>
    </div>
  )
}
