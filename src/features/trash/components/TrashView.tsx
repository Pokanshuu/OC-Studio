'use client'

import { useState, useCallback, useMemo } from "react"
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
import { useTrash } from "../hooks/useTrash"
import * as trashService from "../services"
import type { TrashItem, TrashItemType } from "../types"

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
            className="bg-transparent border border-error text-error hover:bg-red-50"
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

  const handleRestore = useCallback(
    async (type: TrashItemType, id: number) => {
      const key = type + "-" + String(id)
      setRestoring(key)
      try {
        await trashService.restoreItem(type, id)
        toast("已恢复")
        refresh()
        window.dispatchEvent(new CustomEvent('data-updated'))
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
        window.dispatchEvent(new CustomEvent('data-updated'))
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-md:w-[calc(100%-2rem)] max-md:min-h-[40vh] max-md:max-h-[calc(100vh-4rem)] max-md:my-4 h-[80vh] w-[80vw] max-w-5xl flex-col overflow-auto rounded-lg border border-line bg-paper ring-1 ring-black/5">
        <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line max-md:px-3 max-md:py-2 px-5 py-3 bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-base text-ink font-serif font-bold">回收站</h2>
            {items.length > 0 ? (
              <span className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted">
                {items.length} 项
              </span>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-ink-muted">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-error">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <Trash2 size={32} strokeWidth={2} className="text-ink-faint" />
            <p className="text-sm text-ink-muted">回收站为空</p>
          </div>
        ) : (
          <div className="max-md:p-4 p-6">
            <div className="flex flex-col gap-6">
              {Object.entries(grouped).map(([typeLabel, groupItems]) => (
                <div key={typeLabel}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-ink-muted uppercase tracking-wider">{typeLabel}</span>
                    <Separator className="flex-1" />
                  </div>
                  <div className="flex flex-col rounded-md border border-line overflow-hidden">
                    {groupItems.map((item, idx) => (
                      <div key={item.type + "-" + item.id}
                        className={(idx > 0 ? "border-t border-line " : "") + "flex items-center gap-4 max-md:px-3 max-md:py-2 px-4 py-3"}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm text-ink">{item.name}</span>
                          <span className="text-xs text-ink-faint">删除于 {formatDeleteTime(item.deletedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRestore(item.type, item.id)}
                            disabled={restoring === item.type + "-" + String(item.id)}
                            className="flex h-8 items-center gap-1 rounded border border-line px-2.5 text-xs text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
                          >
                            <Undo2 size={14} strokeWidth={2} />
                            <span>恢复</span>
                          </button>
                          <button
                            onClick={() => setConfirmTarget({ type: item.type, id: item.id })}
                            className="flex h-8 items-center gap-1 rounded border border-line px-2.5 text-xs text-ink-muted transition-colors hover:border-error hover:text-error"
                          >
                            <XCircle size={14} strokeWidth={2} />
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
