'use client'

/**
 * 表格里的就地改名 / 改字段。
 *
 * 只有**纯文本字段**走这里（词条标题 / 国家名 / 角色名·种族·职业 / 事件标题）：
 * `制度` / `类别` 这类老字段里可能是 HTML，用单行输入提交会把格式整个抹掉，
 * 它们只在表里显示剥过标签的文本，编辑仍回各自的编辑器。
 *
 * 交互：单击进入、Enter / 失焦提交、Esc 放弃；值没变或清空都不提交
 * （清空名字会让引用断掉，交回编辑器处理）。
 */
import { useEffect, useRef, useState } from 'react'
import { ROUND_ITEM } from '@/lib/ui-tokens'

interface EditableCellProps {
  value: string
  onCommit: (value: string) => Promise<void> | void
  /** 空值占位（表格里默认一个破折号） */
  placeholder?: string
  /** 读屏 / 悬停提示用的字段名（「角色名」） */
  label?: string
  className?: string
  mono?: boolean
}

export function EditableCell({
  value,
  onCommit,
  placeholder = '—',
  label = '名称',
  className = '',
  mono = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = async (): Promise<void> => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }
    if (saving) return
    const next = draft.trim()
    if (next === '' || next === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onCommit(next)
      setEditing(false)
    } catch {
      // 调用方已经 toast；留在编辑态，草稿还在，可以再按一次 Enter 重试
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelledRef.current = true
            setDraft(value)
            setEditing(false)
          }
        }}
        className={`h-7 min-w-0 border-b border-line bg-transparent px-0 text-[13px] text-ink transition-colors focus:border-line-hover focus:outline-none ${
          mono ? 'font-mono' : ''
        } ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      title={value ? `${value} · 点击编辑` : '点击编辑'}
      onClick={(event) => {
        event.stopPropagation()
        setDraft(value)
        setEditing(true)
      }}
      className={`-mx-1 flex h-7 min-w-0 items-center gap-1 px-1 text-left text-[13px] transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM} ${
        mono ? 'font-mono' : ''
      } ${className}`}
    >
      <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink' : 'text-ink-faint'}`}>
        {value || placeholder}
      </span>
    </button>
  )
}
