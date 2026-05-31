'use client'

import { X } from 'lucide-react'
import type { Tag } from '@/types'

const PRESET_COLORS: Record<string, string> = {
  '#FF6B6B': 'bg-[#FF6B6B]/15 text-[#FF6B6B] border-[#FF6B6B]/30',
  '#4ECDC4': 'bg-[#4ECDC4]/15 text-[#4ECDC4] border-[#4ECDC4]/30',
  '#45B7D1': 'bg-[#45B7D1]/15 text-[#45B7D1] border-[#45B7D1]/30',
  '#96CEB4': 'bg-[#96CEB4]/15 text-[#96CEB4] border-[#96CEB4]/30',
  '#FFEAA7': 'bg-[#FFEAA7]/15 text-[#FFEAA7] border-[#FFEAA7]/30',
  '#DDA0DD': 'bg-[#DDA0DD]/15 text-[#DDA0DD] border-[#DDA0DD]/30',
  '#98D8C8': 'bg-[#98D8C8]/15 text-[#98D8C8] border-[#98D8C8]/30',
  '#F7DC6F': 'bg-[#F7DC6F]/15 text-[#F7DC6F] border-[#F7DC6F]/30',
  '#BB8FCE': 'bg-[#BB8FCE]/15 text-[#BB8FCE] border-[#BB8FCE]/30',
  '#85C1E9': 'bg-[#85C1E9]/15 text-[#85C1E9] border-[#85C1E9]/30',
}

const FALLBACK_CLASS = 'bg-black/8 dark:bg-white/8 text-ink border-line/30'

interface TagBadgeProps {
  tag: Tag
  onRemove?: () => void
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  const colorClass = PRESET_COLORS[tag.color] ?? FALLBACK_CLASS

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-xs ${colorClass}`}
    >
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 rounded-full p-0.5 transition-colors hover:text-error"
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : null}
    </span>
  )
}
