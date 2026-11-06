/**
 * Small shared primitives. Everything visual is CSS-class driven so the design
 * tokens in `styles/base.css` stay the single source of truth.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Dialog as HostDialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AgentLayer, agentOverlayContainer } from '@/plugins/agent/host/plugin-layer'
import { Icon, type IconName } from './Icon'

// ── buttons ─────────────────────────────────────────────────────────────────

export type ButtonVariant = 'ghost' | 'primary' | 'quiet' | 'danger'

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  block,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  disabled?: boolean
  block?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  const classes = ['btn']
  if (variant !== 'ghost') classes.push(variant)
  if (size === 'sm') classes.push('sm')
  if (block) classes.push('block')
  return (
    <button type={type} className={classes.join(' ')} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  size = 16,
  active,
  danger,
  disabled,
  className,
}: {
  icon: IconName
  /** Also the tooltip / accessible name — an icon alone is not a label. */
  label: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  size?: number
  active?: boolean
  danger?: boolean
  disabled?: boolean
  className?: string
}) {
  const classes = ['icon-btn']
  if (active) classes.push('active')
  if (danger) classes.push('danger')
  if (className) classes.push(className)
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

// ── toggles ─────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
    />
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ ['--fill' as string]: `${fill}%` }}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ── layout helpers ──────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  children,
}: {
  label?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field-row">
      <div style={{ minWidth: 0 }}>
        <div className="label">{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div style={{ flex: '0 0 auto' }}>{children}</div>
    </div>
  )
}

// ── dialog ──────────────────────────────────────────────────────────────────

/**
 * 弹窗外壳直接复用宿主的 `components/ui/dialog`（Base UI）：遮罩、焦点圈、
 * Esc / 点外关闭、挂到 `#overlay-root`、进出场动画都由它统一提供。
 * 这里只保留插件的页头 / 滚动体 / 页脚排版，内容包一层 `AgentLayer`
 * 让 `.oc-agent-root` 作用域的样式与令牌生效。
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  headExtra,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  headExtra?: ReactNode
}) {
  return (
    <HostDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0 sm:max-w-none',
          wide
            ? 'h-[min(80vh,820px)] w-[min(880px,calc(100vw-2rem))]'
            : 'max-h-[min(82vh,760px)] w-[min(520px,calc(100vw-2rem))]',
        )}
      >
        <AgentLayer className="flex min-h-0 flex-1 flex-col">
          <div className="dialog-head">
            <div className="dialog-title">{title}</div>
            {headExtra}
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </AgentLayer>
      </DialogContent>
    </HostDialog>
  )
}

// ── anchored menu ───────────────────────────────────────────────────────────

export interface MenuAnchor {
  x: number
  y: number
}

/**
 * 锚定到坐标的菜单。外壳取宿主的 `MENU` 令牌（同一档描边 / 模糊 / 阴影 /
 * 圆角 / 行高），不再自带一套 `.menu` 样式；位置仍由这里按视口夹取，
 * 因为它锚的是「右键点 / 按钮下沿」，不是某个 trigger。
 */
export function Menu({
  anchor,
  onClose,
  children,
  footer,
}: {
  anchor: MenuAnchor | null
  onClose: () => void
  children: ReactNode
  /** Pinned below the scroll area — stays visible while the list scrolls. */
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!anchor) {
      setPosition(null)
      return
    }
    // Measure after mount, then clamp into the viewport — a menu opened near the
    // right or bottom edge must not hang off-screen.
    const element = ref.current
    const width = element?.offsetWidth ?? 180
    // `offsetHeight` is already capped by the CSS max-height; clamp again so an
    // unmeasured first paint cannot push the menu off the top of the screen.
    const height = Math.min(element?.offsetHeight ?? 200, window.innerHeight - 16)
    const margin = 8
    const left = Math.min(anchor.x, window.innerWidth - width - margin)
    const preferredTop = anchor.y + height + margin > window.innerHeight
      ? anchor.y - height - margin
      : anchor.y
    const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin))
    setPosition({ left: Math.max(margin, left), top })
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    const close = () => onClose()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // `mousedown` on the next frame so the opening click does not close it.
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('resize', close)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  if (!anchor) return null

  const container = agentOverlayContainer()
  if (!container) return null

  return createPortal(
    <AgentLayer>
      <div
        ref={ref}
        className={`menu${footer ? ' with-footer' : ' scroll'}`}
        style={{ left: position?.left ?? anchor.x, top: position?.top ?? anchor.y, visibility: position ? 'visible' : 'hidden' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {footer ? <div className="menu-scroll">{children}</div> : children}
        {footer && <div className="menu-footer">{footer}</div>}
      </div>
    </AgentLayer>,
    container,
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  /** Only pass an icon for an **action**; selection lists use `check` alone. */
  icon?: IconName
  children: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`menu-item${danger ? ' danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {/* Fixed slot: a list with one checked row must not shift the others. */}
      <span className="menu-item-slot">{icon ? <Icon name={icon} size={14} /> : null}</span>
      <span className="truncate">{children}</span>
    </button>
  )
}

export function MenuSeparator() {
  return <div className="menu-sep" />
}

// ── toasts ──────────────────────────────────────────────────────────────────

interface ToastApi {
  show: (text: string, kind?: 'info' | 'error') => void
}

/**
 * 提示走宿主的 sonner（`app/layout.tsx` 里挂了 `<Toaster />`）：
 * 位置、纸色、暗色、动效与全站一致，不再自带一套 `.toasts` portal。
 */
export function useToast(): ToastApi {
  return useMemo(
    () => ({
      show: (text: string, kind: 'info' | 'error' = 'info') => {
        if (kind === 'error') toast.error(text)
        else toast(text)
      },
    }),
    [],
  )
}

/** 兼容调用点：宿主已有全局 Toaster，这里只做透传 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// ── misc ────────────────────────────────────────────────────────────────────

/** Stable id helper for label/input pairs. */
export function useFieldId(prefix: string): string {
  const id = useId()
  return `${prefix}-${id}`
}

/** Copy helper that works in the Tauri webview (async clipboard API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older WebView2 builds can reject without a focused document.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

/** Relative "3 分钟前" style stamp for conversation rows. */
export function relativeTime(timestamp: number, language: 'zh' | 'en'): string {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return language === 'zh' ? '刚刚' : 'just now'
  if (diff < hour) {
    const n = Math.floor(diff / minute)
    return language === 'zh' ? `${n} 分钟前` : `${n} min ago`
  }
  if (diff < day) {
    const n = Math.floor(diff / hour)
    return language === 'zh' ? `${n} 小时前` : `${n} h ago`
  }
  if (diff < 7 * day) {
    const n = Math.floor(diff / day)
    return language === 'zh' ? `${n} 天前` : `${n} d ago`
  }
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
