'use client'

import { EDITOR_LAYOUT_OPTIONS, type EditorLayout } from "@/lib/editor-layout"
import { COVER_TINT_MODE_OPTIONS, type CoverTintMode } from "@/lib/cover"
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "@/lib/edge-style"
import { THEME_PRESETS, type ThemePreset, type ThemePresetId } from "@/lib/theme/presets"

/** 设置页的共享控件：主题单选 + 开关样式常量（被「个性化」等 tab 使用）。 */
export const THEME_OPTIONS = [
  { value: "light", label: "白天模式" },
  { value: "dark", label: "夜间模式" },
  { value: "auto", label: "跟随系统" },
] as const

/**
 * 单选项的唯一实现：圆点 + 文字，等分网格。
 *
 * 单选圈：选中只加实心点（`ink-muted`，和复选框、开关同一枚「选中」色），
 * 外圈最多到 `line-hover` —— 用墨色在深色底上会变成一只刺眼的白环。
 *
 * 选项等分列，三项在窄屏退成两列；文字**不换行**：宁可换列，也不把
 * 「白天模式」折成「白天 / 模式」。
 */
function RadioGrid<T extends string>({
  name,
  value,
  options,
  onChange,
  columns,
}: {
  name: string
  value: string
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  columns: 2 | 3
}) {
  return (
    <div
      className={
        columns === 3
          ? "grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3"
          : "flex flex-wrap gap-x-8 gap-y-1.5"
      }
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <label key={option.value} className="flex min-w-0 cursor-pointer items-center gap-2">
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                selected ? "border-line-hover" : "border-line"
              }`}
            >
              {selected ? <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" /> : null}
            </span>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="whitespace-nowrap text-[13px] leading-none text-ink">{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}

/** 显示模式：白天 / 夜间 / 跟随系统 */
export function ThemeRadio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <RadioGrid name="theme" value={value} options={THEME_OPTIONS} onChange={onChange} columns={3} />
}

/** 编辑界面样式：多栏 / 全屏 / 自动 */
export function LayoutRadio({
  value,
  onChange,
}: {
  value: EditorLayout
  onChange: (v: EditorLayout) => void
}) {
  return (
    <RadioGrid name="editorLayout" value={value} options={EDITOR_LAYOUT_OPTIONS} onChange={onChange} columns={3} />
  )
}

/**
 * 官方主题选择：一块「纸 + 两行墨」的小样。
 *
 * 一行 11 枚圆点正好铺满一行；窄屏自然折行 —— 每枚都等大，
 * 折行也不会出现「最后一行看着像另一个量级」。
 */
export function ThemePresetRadio({
  value,
  onChange,
  presets = THEME_PRESETS,
}: {
  value: ThemePresetId
  onChange: (v: ThemePresetId) => void
  presets?: readonly ThemePreset[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => {
        const selected = value === preset.id
        return (
          <label key={preset.id} title={preset.name} className="cursor-pointer">
            <input
              type="radio"
              name="themePreset"
              value={preset.id}
              checked={selected}
              onChange={() => onChange(preset.id as ThemePresetId)}
              className="peer sr-only"
            />
            {/* 一枚圆点就是一套纸色。用的是**样品色**而不是纸色本身：
                纸色都压到接近中性，拿它画圆点几乎分不出色相。 */}
            <span
              aria-hidden
              className={`block h-6 w-6 rounded-full border transition-colors peer-focus-visible:border-line-hover ${
                selected ? 'border-ink' : 'border-transparent hover:border-line-hover'
              }`}
              style={{ background: preset.swatch }}
            />
          </label>
        )
      })}
    </div>
  )
}

/** 开关：胶囊轨道 + 圆形滑块（界面里唯一的「圆」除了头像，因为它表达的是拨动） */
export const SWITCH_CLASSES = {
  base: "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
  on: "border-line-hover bg-ink-muted",
  off: "border-line bg-[var(--oc-hover)]",
}

export const SWITCH_DOT =
  "block h-3.5 w-3.5 rounded-full transition-transform bg-ink-muted"

export const MOUSE_MODE_OPTIONS: Array<{ value: 'left-pan' | 'right-pan'; label: string }> = [
  { value: 'left-pan', label: '左键平移' },
  { value: 'right-pan', label: '右键平移' },
]

/** 关系图鼠标模式：左键平移 / 右键平移（框选入口随之切换，不必写进选项名） */
export function MouseModeRadio({
  value,
  onChange,
}: {
  value: 'left-pan' | 'right-pan'
  onChange: (v: 'left-pan' | 'right-pan') => void
}) {
  return <RadioGrid name="mouseMode" value={value} options={MOUSE_MODE_OPTIONS} onChange={onChange} columns={2} />
}

/** 关系图边型：正交（四向落点）/ 曲线（从节点边缘发散） */
export function EdgeStyleRadio({
  value,
  onChange,
}: {
  value: EdgeStyle
  onChange: (v: EdgeStyle) => void
}) {
  return <RadioGrid name="edgeStyle" value={value} options={EDGE_STYLE_OPTIONS} onChange={onChange} columns={2} />
}

/** 封面卡混色：彩色（跟着封面图取色）/ 黑白（设计令牌的墨色） */
export function CoverTintRadio({
  value,
  onChange,
}: {
  value: CoverTintMode
  onChange: (v: CoverTintMode) => void
}) {
  return (
    <RadioGrid name="coverTintMode" value={value} options={COVER_TINT_MODE_OPTIONS} onChange={onChange} columns={2} />
  )
}
