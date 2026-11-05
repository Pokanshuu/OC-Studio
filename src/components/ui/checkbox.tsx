'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}

/**
 * 行内多选方框 —— **只有视觉，不是按钮**。
 *
 * 列表行本身就是按钮（图层行 / 文件夹成员行），按钮里再套按钮是不合法的，
 * 所以选中态由这一枚 `<span>` 画：墨色实心 + 纸色勾（和正文任务列表同一口径）。
 * 交互（点击、键盘）一律交给外层那一行。
 */
export function CheckboxBox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-item border transition-colors',
        checked ? 'border-ink bg-ink text-paper' : 'border-line',
        className,
      )}
    >
      {checked ? <Check size={11} strokeWidth={2.5} /> : null}
    </span>
  )
}

export function Checkbox({ id, checked, onCheckedChange, className }: CheckboxProps) {
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-item border transition-colors',
        checked ? 'border-line-hover bg-paper-card' : 'border-line bg-paper-card',
        className,
      )}
    >
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-ink-muted">
          <polyline
            points="2,5 4,7 8,3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  )
}
