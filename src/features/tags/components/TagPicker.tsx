'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { useTags, useTagMutations } from '../hooks/useTags'
import { TagBadge } from './TagBadge'
import { useDevice } from '@/lib/use-device'
import { useKeyboard } from '@/lib/KeyboardContext'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet } from '@/components/shared/MobileActionSheet'
import type { Tag } from '@/types'

const DEFAULT_COLORS = ['#4ECDC4', '#45B7D1', '#FF6B6B', '#96CEB4', '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9']

function TagRow({ tag, onAdd, onDelete, onLongPress, isMobile }: {
  tag: Tag
  onAdd: (id: number) => void
  onDelete: () => void
  onLongPress: () => void
  isMobile: boolean
}) {
  const didLongPress = useRef(false)

  const longPress = useLongPress({
    onLongPress: () => {
      didLongPress.current = true
      onLongPress()
    },
    enabled: isMobile,
  })

  function handleClick() {
    if (didLongPress.current) {
      didLongPress.current = false
      return
    }
    if (tag.id != null) onAdd(tag.id)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && tag.id != null) onAdd(tag.id) }}
      className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer"
      {...longPress}
    >
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#999' }} />
      <span className="flex-1">{tag.name}</span>
      {!isMobile ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="rounded-full p-0.5 transition-colors hover:text-error opacity-0 group-hover:opacity-100"
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}

interface TagPickerProps {
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export function TagPicker({ selectedIds, onChange }: TagPickerProps) {
  const { tags, loading, refresh, optimisticAdd } = useTags()
  const { createTag, deleteTag } = useTagMutations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { isMobile } = useDevice()
  const { viewportHeight: keyboardHeight } = useKeyboard()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; tagId: number | null }>({ open: false, tagId: null })

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    function handler(e: MouseEvent) {
      const overlayRoot = document.getElementById('overlay-root')
      if (overlayRoot && overlayRoot.contains(e.target as Node)) return
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
    if (!query.trim()) return unselected
    const q = query.trim().toLowerCase()
    return unselected.filter((t) => t.name.toLowerCase().includes(q))
  }, [tags, selectedIds, query])

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
    setOpen(true)
  }

  async function handleDeleteTag(id: number) {
    await deleteTag(id)
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id))
    }
    setActionSheet({ open: false, tagId: null })
    refresh()
  }

  const handleLongPress = useCallback((tagId: number) => {
    setActionSheet({ open: true, tagId })
  }, [])

  async function handleCreate() {
    const name = query.trim()
    if (!name) return
    setCreating(true)
    try {
      const color = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]
      const id = await createTag({ name, category: '', color })
      optimisticAdd({ id, name, category: '', color })
      onChange([...selectedIds, id])
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
          <div className="flex items-center gap-1 h-8 rounded border border-line bg-paper-card px-3 focus-within:border-line-hover transition-colors">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
                if (e.key === 'Escape') { setOpen(false) }
              }}
              placeholder="搜索或新建标签..."
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !query.trim()}
              className="flex items-center justify-center h-6 w-6 shrink-0 rounded text-ink-muted hover:text-ink disabled:opacity-30 transition-colors"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          </div>
          <div className={`absolute left-0 z-50 w-full rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 max-h-48 overflow-auto ${keyboardHeight > 0 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            {loading ? (
              <div className="px-3 py-2 text-sm text-ink-muted">加载中...</div>
            ) : availableTags.length > 0 ? (
              availableTags.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  onAdd={addTag}
                  onDelete={() => { if (tag.id != null) handleDeleteTag(tag.id) }}
                  onLongPress={() => { if (tag.id != null) handleLongPress(tag.id) }}
                  isMobile={isMobile}
                />
              ))
            ) : query.trim() ? (
              <div className="px-3 py-2 text-sm text-ink-faint">按 Enter 或点 + 新建</div>
            ) : (
              <div className="px-3 py-2 text-sm text-ink-faint">没有更多标签</div>
            )}
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

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet({ open: false, tagId: null })}
        title="标签操作"
        actions={[
          {
            id: 'delete',
            label: '删除标签',
            icon: <Trash2 size={18} strokeWidth={2} />,
            destructive: true,
            onPress: () => {
              if (actionSheet.tagId != null) handleDeleteTag(actionSheet.tagId)
            },
          },
        ]}
      />
    </div>
  )
}
