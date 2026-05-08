'use client'

import { Image as ImageIcon } from 'lucide-react'

interface ImageUploadProps {
  currentUrl?: string
  onChange?: (url: string) => void
  placeholder?: string
}

export function ImageUpload({ placeholder = '图片功能开发中...' }: ImageUploadProps) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line h-40 text-ink-muted text-sm">
      <ImageIcon size={24} strokeWidth={1.5} />
      <span className="text-xs text-ink-faint text-center">{placeholder}</span>
    </div>
  )
}
