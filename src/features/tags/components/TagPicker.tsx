'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
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
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setNewName('')
      return
    }
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
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

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id!))

  const availableTags = useMemo(() => {
    const unselected = tags.filter((t) => !selectedIds.includes(t.id!))
    if (!search.trim()) return unselected
    const q = search.trim().toLowerCase()
    return unselected.filter((t) => t.name.toLowerCase().includes(q))
  }, [tags, selectedIds, search])

  function addTag(id: number) {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id])
    }
    setOpen(false)
  }

  function removeTag(id: number) {
    onChange(selectedIds.filter((i) => i !== id))
  }

  function handleAddClick() {
    setSearch('')
    setOpen(true)
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
      setOpen(false)
      refresh()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onRemove={() => { if (tag.id != null) removeTag(tag.id) }}
            />
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="搜索标签..."
            className="h-8 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 max-h-48 overflow-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-ink-muted">加载中...</div>
            ) : availableTags.length > 0 ? (
              availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (tag.id != null) addTag(tag.id) }}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#999' }} />
                  <span className="flex-1">{tag.name}</span>
                </button>
              ))
            ) : search.trim() ? (
              <div className="px-3 py-2 text-sm text-ink-faint">未找到匹配标签</div>
            ) : (
              <div className="px-3 py-2 text-sm text-ink-faint">没有更多标签</div>
            )}

            <div className="border-t border-line px-2 py-1.5 flex items-center gap-1">
              <input
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
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddClick}
          className="flex h-8 items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <Plus size={16} strokeWidth={2} />
          <span>添加</span>
        </button>
      )}
    </div>
  )
}
