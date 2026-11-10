'use client'

/**
 * 导出中心的配置控件原子。
 *
 * 配置面可以像工具（见 `docs/模板.md` §7.1），但墨水必须与写作面同一套：
 * 小圆角、零描边、选中用浅底块、分组标题只用极小的字距字。
 */
import type { ReactNode } from 'react'
import { Check, Star, X } from 'lucide-react'
import { SWITCH_CLASSES, SWITCH_DOT } from '@/components/settings/controls'
import { ROUND_ITEM } from '@/lib/ui-tokens'

export const EXPORT_SECTION_LABEL = 'text-[11px] tracking-[0.08em] text-ink-faint'
export const EXPORT_ROW_LABEL = 'text-[12px] text-ink-muted'

export function ExportSection({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex flex-col gap-2 ${className}`}>
      <h3 className={EXPORT_SECTION_LABEL}>{title}</h3>
      {children}
    </section>
  )
}

export function ExportRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className={`min-w-0 ${EXPORT_ROW_LABEL}`}>{label}</span>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1">{children}</div>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: T
  options: readonly { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap items-center gap-0.5 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`${ROUND_ITEM} h-7 px-2 text-[12px] transition-colors ${
              active
                ? 'bg-ink font-medium text-paper'
                : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 开关 —— 直接借设置页那一枚（`SWITCH_CLASSES` / `SWITCH_DOT`），
 * 导出面板里不该长出第二种开关。
 */
export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`${SWITCH_CLASSES.base} ${checked ? SWITCH_CLASSES.on : SWITCH_CLASSES.off}`}
    >
      <span className={`${SWITCH_DOT} ${checked ? 'translate-x-[18px] bg-paper' : 'translate-x-[2px]'}`} />
    </button>
  )
}

/**
 * 滑杆的样子写在组件里，不靠 `globals.css` 里的 `.oc-range`。
 *
 * 原生 `input[type=range]` 在 Chromium 里是蓝色圆点 + 蓝轨，跟这套界面完全不是一回事；
 * 而那次把样式放进全局样式表后，globals.css 被整体重写过一遍，`.oc-range` 被顺手丢了，
 * 滑杆就退回了原生控件。样式跟着控件的唯一使用方走，谁重写全局表都不会再弄丢。
 * 轨 2px、拇指 12px 墨色（`-5px` = (2 - 12) / 2，让拇指在细轨上居中）。
 */
const RANGE_CLASS = [
  'h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent',
  '[&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[var(--oc-line-hover)]',
  '[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink',
  '[&::-moz-range-track]:h-[2px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[var(--oc-line-hover)]',
  '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oc-ink)]',
].join(' ')

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  format,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  ariaLabel: string
  format?: (value: number) => string
}) {
  const shown = format ? format(value) : String(value)
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={shown}
        onChange={(event) => onChange(Number(event.target.value))}
        className={RANGE_CLASS}
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">{shown}</span>
    </div>
  )
}

/** 背景色块：选中打勾，不做 ring（设计规范禁止光晕）。 */
export function Swatch({
  label,
  selected,
  onSelect,
  swatchClass,
  swatchStyle,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  swatchClass?: string
  swatchStyle?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${ROUND_ITEM} flex flex-col items-start gap-1.5 p-1 text-left transition-colors ${
        selected ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
      }`}
    >
      <span
        className={`relative flex h-9 w-full items-center justify-center overflow-hidden border border-line ${ROUND_ITEM} ${swatchClass ?? ''}`}
        style={swatchStyle}
      >
        {selected ? <Check size={14} strokeWidth={2} className="text-ink" /> : null}
      </span>
      <span className={`text-[11px] ${selected ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
    </button>
  )
}

/** 预设行：名字 + 默认星标 + 删除。 */
export function PresetRow({
  name,
  active,
  isDefault,
  builtin,
  onApply,
  onSetDefault,
  onDelete,
}: {
  name: string
  active?: boolean
  isDefault: boolean
  builtin?: boolean
  onApply: () => void
  onSetDefault: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onApply}
        className={`${ROUND_ITEM} min-w-0 flex-1 truncate px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-[var(--oc-hover)] ${
          active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'
        }`}
      >
        {name}
      </button>
      <button
        type="button"
        onClick={onSetDefault}
        aria-label={`将${name}设为默认`}
        aria-pressed={isDefault}
        className={`${ROUND_ITEM} flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink`}
      >
        <Star size={12} strokeWidth={2} className={isDefault ? 'fill-current text-ink' : ''} />
      </button>
      {builtin ? null : (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`删除预设${name}`}
          className={`${ROUND_ITEM} flex h-6 w-6 shrink-0 items-center justify-center text-[11px] text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-error`}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
