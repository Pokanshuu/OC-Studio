'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { useTags, useTagMutations } from '../hooks/useTags'
import { useDevice } from '@/lib/use-device'
import { useKeyboard } from '@/lib/KeyboardContext'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet } from '@/components/shared/MobileActionSheet'
import { MENU } from '@/lib/ui-tokens'
import type { Tag } from '@/types'

const DEFAULT_COLORS = ['#4ECDC4', '#45B7D1', '#FF6B6B', '#96CEB4', '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9']

/** 方形 chip，与 RelatedItemsSelector 的 chip 同一套尺寸（12px / py-[3px]） */
const CHIP_BASE = 'px-2 py-[3px] text-[12px] transition-colors'
const CHIP_ON = `${CHIP_BASE} bg-ink text-paper`
const CHIP_OFF = `${CHIP_BASE} bg-paper-alt text-ink-muted hover:bg-paper-card hover:text-ink`

/** 单个标签 chip：点击切换选中；移动端长按弹出删除 */
function TagChip({ tag, selected, onToggle, onLongPress, isMobile }: {
  tag: Tag
  selected: boolean
  onToggle: () => void
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

  return (
    <button
      type="button"
      onClick={() => {
        if (didLongPress.current) {
          didLongPress.current = false
          return
        }
        onToggle()
      }}
      className={`${selected ? CHIP_ON : CHIP_OFF}`}
      {...longPress}
    >
      {tag.name}
    </button>
  )
}

interface TagPickerProps {
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export function TagPicker({ selectedIds, onChange }: TagPickerProps) {
  const { tags, refresh, optimisticAdd } = useTags()
  const { createTag, deleteTag } = useTagMutations()
  const [panelOpen, setPanelOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { isMobile } = useDevice()
  const { viewportHeight: keyboardHeight } = useKeyboard()
  const [actionSheet, setActionSheet] = useState<{ open: boolean; tagId: number | null }>({ open: false, tagId: null })

  useEffect(() => {
    if (!panelOpen) {
      setQuery('')
      return
    }
    function handler(e: MouseEvent) {
      const overlayRoot = document.getElementById('overlay-root')
      if (overlayRoot && overlayRoot.contains(e.target as Node)) return
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handler)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handler)
    }
  }, [panelOpen])

  const candidates = useMemo(() => {
    const unselected = tags.filter((t) => !selectedIds.includes(t.id!))
    if (!query.trim()) return unselected
    const q = query.trim().toLowerCase()
    return unselected.filter((t) => t.name.toLowerCase().includes(q))
  }, [tags, selectedIds, query])

  const hasExactMatch = useMemo(
    () => tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()),
    [tags, query],
  )

  function addTag(id: number) {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id])
    }
  }

  function removeTag(id: number) {
    onChange(selectedIds.filter((i) => i !== id))
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
      setQuery('')
      refresh()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 全部标签内联为方形 chip，选中的实心墨色 */}
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            selected={tag.id != null && selectedIds.includes(tag.id)}
            onToggle={() => {
              if (tag.id == null) return
              if (selectedIds.includes(tag.id)) removeTag(tag.id)
              else addTag(tag.id)
            }}
            onLongPress={() => { if (tag.id != null) handleLongPress(tag.id) }}
            isMobile={isMobile}
          />
        ))}

        {/* 输入与「＋」合并为一个 chip */}
        <div className="flex items-center gap-1 bg-paper-alt px-2 py-[3px] text-[12px] transition-colors focus-within:bg-paper-card">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPanelOpen(true)
            }}
            onFocus={() => setPanelOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleCreate()
              }
              if (e.key === 'Escape') {
                setPanelOpen(false)
                searchInputRef.current?.blur()
              }
            }}
            placeholder="标签"
            className="w-10 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !query.trim() || hasExactMatch}
            title={hasExactMatch ? '已存在同名标签' : '新建标签'}
            className="flex shrink-0 items-center text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>
      </div>

      {panelOpen ? (
        <div className={`absolute left-0 z-50 max-h-48 min-w-[180px] overflow-auto ${MENU} ${keyboardHeight > 0 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {candidates.length > 0 ? (
            candidates.map((tag) => (
              <div
                key={tag.id}
                role="button"
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (tag.id != null) { addTag(tag.id); setQuery('') } }}
                onKeyDown={(e) => { if (e.key === 'Enter' && tag.id != null) { addTag(tag.id); setQuery('') } }}
                className="group flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
              >
                <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: tag.color || '#999' }} />
                <span className="flex-1">{tag.name}</span>
                {!isMobile ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (tag.id != null) void handleDeleteTag(tag.id) }}
                    className="rounded-none p-0.5 opacity-0 transition-colors hover:text-error group-hover:opacity-100"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            ))
          ) : query.trim() ? (
            <div className="px-2.5 py-2 text-[13px] text-ink-faint">按 Enter 新建「{query.trim()}」</div>
          ) : (
            <div className="px-2.5 py-2 text-[13px] text-ink-faint">没有更多标签</div>
          )}
        </div>
      ) : null}

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
              if (actionSheet.tagId != null) void handleDeleteTag(actionSheet.tagId)
            },
          },
        ]}
      />
    </div>
  )
}
