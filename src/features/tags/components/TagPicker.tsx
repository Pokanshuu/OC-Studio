'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Check } from 'lucide-react'
import type { Tag } from '@/types'
import { useTags, useTagMutations } from '../hooks/useTags'
import { TagBadge } from './TagBadge'

const DEFAULT_COLORS = ['#4ECDC4', '#45B7D1', '#FF6B6B', '#96CEB4', '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9']

interface TagPickerProps {
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export function TagPicker({ selectedIds, onChange }: TagPickerProps) {
  const { tags, loading, refresh } = useTags()
  const { createTag } = useTagMutations()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setNewName('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setNewName('')
      }
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handler)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [open])

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id!))
  const availableTags = tags.filter((t) => !selectedIds.includes(t.id!))

  function toggleTag(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const color = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]
      const id = await createTag({ name, category: '', color })
      onChange([...selectedIds, id])
      setNewName('')
      refresh()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex min-h-[36px] flex-wrap items-center gap-1 rounded-md border border-line bg-paper-card px-2 py-1.5 cursor-pointer hover:border-line-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onRemove={() => { if (tag.id != null) toggleTag(tag.id) }}
            />
          ))
        ) : (
          <span className="text-sm text-ink-faint">选择标签...</span>
        )}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5">
          {loading ? (
            <div className="px-3 py-2 text-sm text-ink-muted">加载中...</div>
          ) : (
            <>
              {availableTags.length > 0 ? (
                availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => { if (tag.id != null) toggleTag(tag.id) }}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#999' }} />
                    <span className="flex-1">{tag.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-ink-faint">没有更多标签</div>
              )}

              <div className="border-t border-line px-2 py-1.5 flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
                  placeholder="新建标签..."
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none px-1"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex items-center justify-center h-6 w-6 rounded text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
