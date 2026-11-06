'use client'

import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * 复选框的唯一视觉：16px 方块，未选只有一条线，选中是墨色实心 + 纸色勾。
 * 与正文任务列表、设置里的开关同一口径（选中 = `ink-muted` 实心），
 * 全项目不要再画第二种勾。
 *
 * `CheckboxBox` 只有视觉，不是按钮 —— 列表行本身就是按钮，按钮里再套按钮不合法，
 * 所以行内（图层行 / 文件夹成员行）用这一枚 `<span>`，点击与键盘交给外层那一行。
 */
export function CheckboxBox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-item border transition-colors',
        checked ? 'border-ink-muted bg-ink-muted text-paper' : 'border-line bg-paper-card',
        className,
      )}
    >
      {checked ? <Check size={11} strokeWidth={2.5} /> : null}
    </span>
  )
}

interface CheckboxProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'children'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** 独立的一枚复选框（设置项、导出配置）。视觉就是 `CheckboxBox`，不另画一套。 */
export function Checkbox({ checked, onCheckedChange, className, ...rest }: CheckboxProps) {
  return (
    <button
      {...rest}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      <CheckboxBox checked={checked} />
    </button>
  )
}
