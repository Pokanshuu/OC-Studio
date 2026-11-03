'use client'

/**
 * 压在图片 / 封面上的圆形图标按钮（S3）—— 唯一皮肤 `OVERLAY_ROUND_BTN`。
 *
 * 只给「浮在图上的操作」用：删除、移到文件夹、拖拽手柄、图片的 ⋯ 菜单。
 * 页面里的按钮仍用 `ICON_BTN` / `ICON_BTN_MD`，不要拿这个替代。
 *
 * 透传 `button` 的其余属性：拖拽手柄要挂 dnd-kit 的 attributes / listeners，
 * `AlertDialogTrigger asChild` 要合并 ref 与 onClick。
 */
import type { ComponentProps, ReactNode } from 'react'
import { OVERLAY_ROUND_BTN } from '@/lib/ui-tokens'

interface OverlayIconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** 无障碍名与 title（图上圆钮没有可见文字） */
  label: string
  children: ReactNode
  className?: string
}

export function OverlayIconButton({
  label,
  children,
  className = '',
  ...rest
}: OverlayIconButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      title={label}
      className={`${OVERLAY_ROUND_BTN} ${className}`}
    >
      {children}
    </button>
  )
}
