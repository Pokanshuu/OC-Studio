'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Plus, X } from 'lucide-react'

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

  return (
    <div ref={containerRef} className="space-y-2">
      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-xs text-ink-muted"
            >
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
                className="ml-0.5 flex cursor-pointer items-center justify-center transition-colors hover:text-error"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="relative">
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
            className="h-8 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
          />
          {open && filtered.length > 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 max-h-48 overflow-auto">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addItem(item.id)}
                  className={`flex w-full items-center rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                    selectedIds.includes(item.id) ? 'bg-black/5 dark:bg-white/5 text-ink' : 'text-ink'
                  }`}
                >
                  <span>{item.name}</span>
                  {item.subtitle ? (
                    <span className="ml-2 text-xs text-ink-faint">{item.subtitle}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {open && search.trim() && filtered.length === 0 ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-line bg-paper-card shadow-none p-3">
              <p className="text-xs text-ink-faint">未找到匹配项</p>
            </div>
          ) : null}
        </div>
      ) : isFull ? null : (
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
