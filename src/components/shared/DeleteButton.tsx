'use client'

import { useState, useRef } from 'react'
import { Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { OverlayIconButton } from './OverlayIconButton'

interface DeleteButtonProps {
  onDelete: () => void
  label?: string
  /** 确认框里的那句说明；默认按单条记录写。会连带删除子项时传自己的 */
  description?: string
  /**
   * 底色：`default` 落在纸面上；`overlay` 压在封面卡的照片上（深色半透明圆底）——
   * 与 `DragHandle` 的 overlay 手柄共用 `OVERLAY_ROUND_BTN`。
   */
  tone?: 'default' | 'overlay'
}

export function DeleteButton({
  onDelete,
  label = '删除',
  description = '删除后将移至回收站，可在回收站里恢复。',
  tone = 'default',
}: DeleteButtonProps) {
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const overlay = tone === 'overlay'

  const handleDelete = () => {
    onDelete()
    setDone(true)
    toast('已移至回收站')
    timerRef.current = setTimeout(() => setDone(false), 1500)
  }

  if (done) {
    return overlay ? (
      <OverlayIconButton label={label}>
        <CheckCircle size={16} strokeWidth={2} />
      </OverlayIconButton>
    ) : (
      <button
        className="flex h-11 w-11 items-center justify-center rounded-item text-success transition-colors duration-150 md:h-6 md:w-6"
        title={label}
      >
        <CheckCircle size={16} strokeWidth={2} />
      </button>
    )
  }

  return (
    <AlertDialog>
      <div onClick={(e) => e.stopPropagation()}>
        <AlertDialogTrigger asChild>
          {overlay ? (
            <OverlayIconButton label={label}>
              <Trash2 size={16} strokeWidth={2} />
            </OverlayIconButton>
          ) : (
            <button
              className="flex h-11 w-11 items-center justify-center rounded-item text-ink-muted transition-colors duration-150 hover:text-error md:h-6 md:w-6"
              title={label}
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </div>
    </AlertDialog>
  )
}
