'use client'

import { CheckCircle, Loader2, CircleAlert } from 'lucide-react'
import { useWordCount } from './WordCountContext'
import { useSaveStatus } from './SaveStatusContext'

export function StatusBar() {
  const { wordCount } = useWordCount()
  const { status } = useSaveStatus()

  const saveLabel = status === 'saving' ? '保存中…' : status === 'dirty' ? '未保存' : '已保存'
  const SaveIcon = status === 'saving' ? Loader2 : status === 'dirty' ? CircleAlert : CheckCircle
  const iconClass =
    status === 'saving'
      ? 'animate-spin text-ink-muted'
      : status === 'dirty'
        ? 'text-warning'
        : 'text-ink-faint'

  return (
    <footer data-statusbar className="max-md:hidden flex h-6 shrink-0 items-center justify-between border-t border-line bg-transparent px-3">
      <span className="text-[11px] text-ink-faint transparent-text">字数：<span className="tabular-nums">{wordCount}</span></span>
      <div className="flex items-center gap-1">
        <SaveIcon size={12} strokeWidth={2} className={iconClass} />
        <span className="text-[11px] text-ink-faint transparent-text">{saveLabel}</span>
      </div>
    </footer>
  )
}
