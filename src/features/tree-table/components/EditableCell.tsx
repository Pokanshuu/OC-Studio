'use client'

import { useEffect, useRef, useState } from 'react'

interface EditableCellProps {
  value: string
  placeholder?: string
  onCommit: (value: string) => Promise<void> | void
  className?: string
  mono?: boolean
  title?: string
}

export function EditableCell({
  value,
  placeholder = '—',
  onCommit,
  className = '',
  mono = false,
  title,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = async (): Promise<void> => {
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onCommit(next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        onClick={(event) => event.stopPropagation()}
        className={`h-7 w-full rounded-sm border border-line-hover bg-paper px-1.5 text-xs text-ink outline-none ${
          mono ? 'font-mono' : ''
        } ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      title={title ?? (value ? `${value} · 点击编辑` : '点击编辑')}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
      className={`group/cell flex h-7 w-full min-w-0 items-center gap-1 rounded-sm px-1.5 text-left text-xs transition-colors hover:bg-paper-card ${
        mono ? 'font-mono' : ''
      } ${className}`}
    >
      <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink' : 'text-ink-faint'}`}>
        {value || placeholder}
      </span>
      {saving ? <span className="text-[9px] text-ink-faint">保存中</span> : null}
    </button>
  )
}
