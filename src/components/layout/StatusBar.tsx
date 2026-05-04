'use client'

import { CheckCircle } from 'lucide-react'
import { useWordCount } from './WordCountContext'

export function StatusBar() {
  const { wordCount } = useWordCount()

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-paper-alt px-4">
      <span className="text-xs text-ink-muted">字数：{wordCount}</span>
      <div className="flex items-center gap-1.5">
        <CheckCircle size={14} strokeWidth={2} className="text-ink-faint" />
        <span className="text-xs text-ink-faint">已同步</span>
      </div>
    </footer>
  )
}
