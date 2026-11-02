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

interface DeleteButtonProps {
  onDelete: () => void
  label?: string
}

export function DeleteButton({ onDelete, label = '删除' }: DeleteButtonProps) {
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleDelete = () => {
    onDelete()
    setDone(true)
    toast('已移至回收站')
    timerRef.current = setTimeout(() => setDone(false), 1500)
  }

  if (done) {
    return (
      <button
        className="flex h-11 w-11 md:h-6 md:w-6 items-center justify-center rounded text-success transition-colors duration-150"
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
          <button
          className="flex h-11 w-11 md:h-6 md:w-6 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:text-error"
          title={label}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            删除后将移至回收站，可在 30 天内恢复。
          </AlertDialogDescription>
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
