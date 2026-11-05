'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { CHIP, MENU, MENU_ITEM_BASE, ADD_ACTION } from '@/lib/ui-tokens'

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
}

/**
 * 单类实体的字段选择器（国籍这类「只能选一个本库实体」的字段）。
 * 关系区块不用它：关系要跨类型、要分组和起名，统一走 `relations/RelationPicker`。
 */
export function RelatedItemsSelector({
  items,
  selectedIds,
  onChange,
  placeholder,
  onNavigateItem,
  maxItems,
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
  const showChips = selectedItems.length > 0

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
        <div className="relative w-44">
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
              className={`absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[220px] overflow-auto ${MENU}`}
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
            <div className={`absolute left-0 top-full z-50 mt-1 min-w-[220px] ${MENU}`}>
              <p className="px-3 py-2 text-[12px] text-ink-faint">未找到匹配项</p>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddClick}
          className={ADD_ACTION}
        >
          <Plus size={12} strokeWidth={2} />
          <span>{isFull ? '更换' : maxItems === 1 ? '选择' : '添加'}</span>
        </button>
      )}
    </div>
  )
}
