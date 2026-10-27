'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { useTags, useTagMutations } from '../hooks/useTags'
import { useDevice } from '@/lib/use-device'
import { useKeyboard } from '@/lib/KeyboardContext'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet } from '@/components/shared/MobileActionSheet'
import { MENU, MENU_ITEM, ROUND_ITEM } from '@/lib/ui-tokens'
import type { Tag } from '@/types'

const DEFAULT_COLORS = ['#4ECDC4', '#45B7D1', '#FF6B6B', '#96CEB4', '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9']

/** 候选列表上限：命中很多时也只渲染这么多行（标签库可能有几百个） */
const MAX_CANDIDATES = 40

/** 小圆角 chip，与 RelatedItemsSelector 的 chip 同一套：低对比底色 + 墨色文字，不用强调色 */
const CHIP = `inline-flex items-center gap-1 bg-paper-alt px-2 py-[3px] text-[12px] text-ink transition-colors ${ROUND_ITEM}`

/** 单个标签 chip：右侧 × 移除（移动端常显）；移动端长按弹出「从标签库删除」 */
function TagChip({ tag, onRemove, onLongPress, isMobile }: {
  tag: Tag
  onRemove: () => void
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
    <span className={CHIP} {...longPress}>
      <span>{tag.name}</span>
      <button
        type="button"
        aria-label={`移除标签 ${tag.name}`}
        title="移除标签"
        onClick={() => {
          if (didLongPress.current) {
            didLongPress.current = false
            return
          }
          onRemove()
        }}
        className="shrink-0 text-ink-faint transition-colors hover:text-error"
      >
        <X size={11} strokeWidth={2} />
      </button>
    </span>
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

  // 只在面板打开时订阅「点外面关闭」。查询词的清空放在打开处（onFocus）的
  // 事件里而不是这里 —— 在 effect 里 setState 会触发 React 的级联渲染告警。
  useEffect(() => {
    if (!panelOpen) return
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

  const selectedTags = useMemo(
    () => tags.filter((t) => t.id != null && selectedIds.includes(t.id)),
    [tags, selectedIds],
  )

  /** 候选只在**输入关键词之后**才算：标签可能有几百个，空查询时列出全部等于噪音 */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return tags
      .filter((t) => !selectedIds.includes(t.id!))
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, MAX_CANDIDATES)
  }, [tags, selectedIds, query])

  const hasExactMatch = useMemo(
    () => tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()),
    [tags, query],
  )

  /** 输入了关键词且没有同名标签时，面板里给一条「新建」入口 */
  const canCreate = query.trim().length > 0 && !hasExactMatch

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
        {/* 只显示这个角色身上的标签；其它标签靠输入关键词在面板里找，不在这里铺开 */}
        {selectedTags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={() => { if (tag.id != null) removeTag(tag.id) }}
            onLongPress={() => { if (tag.id != null) handleLongPress(tag.id) }}
            isMobile={isMobile}
          />
        ))}

        {/* 输入与「＋」合并为一个 chip */}
        <div className="relative flex items-center gap-1 bg-paper-alt px-2 py-[3px] text-[12px] transition-colors focus-within:bg-paper-card">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPanelOpen(true)
            }}
            onFocus={() => {
              // 每次重新打开都从空查询开始（清空动作放在事件里，见上面的 useEffect 注释）
              if (!panelOpen) setQuery('')
              setPanelOpen(true)
            }}
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

          {/* 面板挂在输入 chip 上：跟着输入框走，不会被前面的标签挤到行首 */}
          {panelOpen ? (
            <div className={`absolute left-0 z-50 max-h-48 min-w-[180px] overflow-auto ${MENU} ${keyboardHeight > 0 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
              {!query.trim() ? (
                <div className="px-3 py-2 text-[13px] text-ink-faint">输入关键词查找标签</div>
              ) : (
                <>
                  {candidates.map((tag) => (
                    <div
                      key={tag.id}
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { if (tag.id != null) { addTag(tag.id); setQuery('') } }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && tag.id != null) { addTag(tag.id); setQuery('') } }}
                      className={`group cursor-pointer ${MENU_ITEM}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color || '#999' }} />
                      <span className="flex-1">{tag.name}</span>
                      {!isMobile ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (tag.id != null) void handleDeleteTag(tag.id) }}
                          className={`p-0.5 opacity-0 transition-colors hover:text-error group-hover:opacity-100 ${ROUND_ITEM}`}
                        >
                          <X size={12} strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={creating}
                      className={`${MENU_ITEM} text-ink-muted disabled:opacity-40`}
                    >
                      <Plus size={12} strokeWidth={2} className="shrink-0" />
                      <span>新建「{query.trim()}」</span>
                    </button>
                  ) : null}

                  {candidates.length === 0 && !canCreate ? (
                    <div className="px-3 py-2 text-[13px] text-ink-faint">没有匹配的标签</div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

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
