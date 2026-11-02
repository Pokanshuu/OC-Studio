'use client'

import { HardDrive } from 'lucide-react'
import { useWordCount } from './WordCountContext'

export function StatusBar() {
  const { wordCount, wordCountLabel } = useWordCount()

  return (
    <footer data-statusbar className="max-md:hidden flex h-8 shrink-0 items-center justify-between border-t border-line bg-transparent px-4">
      <span className="text-xs text-ink-muted transparent-text">
        {wordCountLabel}：{wordCount}
      </span>
      <div className="flex items-center gap-1.5">
        <HardDrive size={14} strokeWidth={2} className="text-ink-faint" />
        <span className="text-xs text-ink-faint transparent-text">本地保存 · 零网络</span>
      </div>
    </footer>
  )
}
