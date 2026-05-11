'use client'

import { CheckCircle } from 'lucide-react'
import { useWordCount } from './WordCountContext'

export function StatusBar() {
  const { wordCount } = useWordCount()

  return (
    <footer data-statusbar className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-transparent px-4">
      <span className="text-xs text-ink-muted transparent-text">字数：{wordCount}</span>
      <div className="flex items-center gap-1.5">
        <CheckCircle size={14} strokeWidth={2} className="text-ink-faint" />
        <span className="text-xs text-ink-faint transparent-text">已同步</span>
      </div>
    </footer>
  )
}
