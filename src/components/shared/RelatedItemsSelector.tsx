'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { CHIP, MENU, MENU_ITEM_BASE } from '@/lib/ui-tokens'

export interface RelatedItem {
  id: number
  name: string
  subtitle?: string
}

interface RelatedItemsSelectorProps {
  items: RelatedItem[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  placeholder: string
  onNavigateItem?: (id: number) => void
  maxItems?: number
  /** 已选项由外部（如关系表）呈现时，隐藏这里的 chip 列表 */
  hideSelected?: boolean
  /** 弹层对齐方向：放在标题行右侧时用 right */
  panelAlign?: 'left' | 'right'
}

/**
 * 关联项选择器。
 * 布局为**单行内联**：已选 chip 与「＋ 添加」同处一个 flex-wrap 容器，
 * 不会像旧的纵向堆叠那样把按钮挤到第二行、造成行高翻倍。
 */
export function RelatedItemsSelector({
  items,
  selectedIds,
  onChange,
  placeholder,
  onNavigateItem,
  maxItems,
  hideSelected = false,
  panelAlign = 'left',
}: RelatedItemsSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, search])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  )

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }

    const id = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  const addItem = useCallback(
    (id: number) => {
      if (!selectedIds.includes(id)) {
        const next = maxItems === 1 ? [id] : [...selectedIds, id]
        onChange(next)
      }
      setSearch('')
      setOpen(false)
    },
    [selectedIds, onChange, maxItems],
  )

  const removeItem = useCallback(
    (id: number) => {
      onChange(selectedIds.filter((sid) => sid !== id))
    },
    [selectedIds, onChange],
  )

  const handleAddClick = useCallback(() => {
    setSearch('')
    setOpen(true)
  }, [])

  const isFull = maxItems !== undefined && selectedIds.length >= maxItems
  const showChips = !hideSelected && selectedItems.length > 0

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
      {showChips
        ? selectedItems.map((item) => (
            <span key={item.id} className={`${CHIP} text-ink`}>
              <button
                type="button"
                onClick={() => onNavigateItem?.(item.id)}
                className="cursor-pointer transition-colors hover:text-ink"
                title={item.name}
              >
                {item.name}
              </button>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="ml-0.5 shrink-0 text-ink-faint transition-colors hover:text-error"
                aria-label={`移除 ${item.name}`}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))
        : null}

      {open ? (
        <div className={`relative ${panelAlign === 'right' ? 'w-56' : 'w-44'}`}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                setSearch('')
              }
            }}
            placeholder={placeholder}
            className="h-6 w-full border-b border-line bg-transparent text-[12px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
          />
          {filtered.length > 0 ? (
            <div
              className={`absolute top-full z-50 mt-1 max-h-48 min-w-[220px] overflow-auto ${MENU} ${
                panelAlign === 'right' ? 'right-0' : 'left-0'
              }`}
            >
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addItem(item.id)}
                  className={`${MENU_ITEM_BASE} ${
                    selectedIds.includes(item.id) ? 'text-ink' : 'text-ink-muted'
                  }`}
                >
                  <span>{item.name}</span>
                  {item.subtitle ? (
                    <span className="ml-2 text-[12px] text-ink-faint">{item.subtitle}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : search.trim() ? (
            <div
              className={`absolute top-full z-50 mt-1 min-w-[220px] ${MENU} ${
                panelAlign === 'right' ? 'right-0' : 'left-0'
              }`}
            >
              <p className="px-3 py-2 text-[12px] text-ink-faint">未找到匹配项</p>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddClick}
          className="flex shrink-0 items-center gap-1 py-[3px] pr-1 text-[12px] text-ink-faint transition-colors hover:text-ink"
        >
          <Plus size={12} strokeWidth={2} />
          <span>{isFull ? '更换' : maxItems === 1 ? '选择' : '添加'}</span>
        </button>
      )}
    </div>
  )
}
