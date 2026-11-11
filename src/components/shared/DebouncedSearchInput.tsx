'use client'

/**
 * 带防抖的搜索框（列表工具栏共用）。
 *
 * 为什么要单独一个组件：搜索框的值一变，列表就要重新筛选 + 重排 + 重建卡片。
 * 卡片多的时候（实测 400 个角色）**一次重建要 0.3–1.2 秒**，如果每敲一个字都做，
 * 输入框自己也会被拖住 —— 用户看到的是「打字一顿一顿的」。
 *
 * 现在把「输入框里的字」和「真正用于筛选的字」拆开：输入框用本地 state 即时回显，
 * 停止输入 `delay` 毫秒后才把值交给列表。外部把值改掉时（清空筛选 / 换库）同步回来。
 */
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'

interface DebouncedSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** 防抖时长；默认 180ms（比视觉停留略长，快速连打只触发一次） */
  delay?: number
}

export function DebouncedSearchInput({
  value,
  onChange,
  placeholder,
  delay = 180,
}: DebouncedSearchInputProps) {
  const [draft, setDraft] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 最后交给外部的值：外部变化与它不同时，说明是被别人改的，要同步回输入框 */
  const appliedRef = useRef(value)

  useEffect(() => {
    if (value !== appliedRef.current) {
      appliedRef.current = value
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const handleChange = (next: string): void => {
    setDraft(next)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      appliedRef.current = next
      onChange(next)
    }, delay)
  }

  return (
    <div className="relative flex items-center">
      <Search size={13} strokeWidth={2} className={SEARCH_ICON} />
      <input
        type="text"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        className={SEARCH_INPUT}
      />
    </div>
  )
}
