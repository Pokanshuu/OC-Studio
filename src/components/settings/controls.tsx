'use client'

import { EDITOR_LAYOUT_OPTIONS, type EditorLayout } from "@/lib/editor-layout"
import { COVER_TINT_MODE_OPTIONS, type CoverTintMode } from "@/lib/cover"
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "@/lib/edge-style"
import { THEME_PRESETS, type ThemePreset, type ThemePresetId } from "@/lib/theme/presets"

// 单选圈：选中只加实心点，外圈最多到 `line-hover`。
// 用墨色（`border-ink`）在深色底上会变成一只刺眼的白环，`line-hover` 才和界面其它
// 分隔线一个强度。
/** 设置页的共享控件：主题单选 + 开关样式常量（被「个性化」等 tab 使用）。 */
export const THEME_OPTIONS = [
  { value: "light", label: "白天模式" },
  { value: "dark", label: "夜间模式" },
  { value: "auto", label: "跟随系统" },
] as const

/** 编辑界面样式单选：多栏 / 全屏 / 自动 */
export function LayoutRadio({
  value,
  onChange,
}: {
  value: EditorLayout
  onChange: (v: EditorLayout) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4">
      {EDITOR_LAYOUT_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? 'border-line-hover' : 'border-line'
            }`}
          >
            {value === opt.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </span>
          <input
            type="radio"
            name="editorLayout"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm leading-none text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

export function ThemeRadio({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4">
      {THEME_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer"
        >
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? 'border-line-hover' : 'border-line'
            }`}
          >
            {value === opt.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </span>
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm leading-none text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * 官方主题选择：一块「纸 + 两行墨」的小样。
 *
 * 网格：**一行 11 格**（`grid-cols-11`）—— 11 套主题正好铺满一行，没有参差的
 * 最后一行。窄屏回落到 4 列（`grid-cols-4`），那时缺一格也无所谓，因为每格都被
 * 撑到等宽，不会出现「最后一行看着像另一个量级」。
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
          <label
            key={preset.id}
            title={preset.name}
            className="cursor-pointer"
          >
            <input
              type="radio"
              name="themePreset"
              value={preset.id}
              checked={selected}
              onChange={() => onChange(preset.id as ThemePresetId)}
              className="peer sr-only"
            />
            {/* 一枚圆点就是一套纸色：纸色做底、墨色做内圈，选中时外面再套一圈墨 */}
            <span
              aria-hidden
              className={`block h-6 w-6 rounded-full border transition-[box-shadow,border-color] peer-focus-visible:border-line-hover ${
                selected ? 'border-line-hover' : 'border-line hover:border-line-hover'
              }`}
              style={{
                background: preset.preview.paper,
                boxShadow: selected
                  ? `inset 0 0 0 2px ${preset.preview.ink}, inset 0 0 0 5px ${preset.preview.paper}`
                  : `inset 0 0 0 2px ${preset.preview.paper}, inset 0 0 0 4px ${preset.preview.ink}33`,
              }}
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
  return (
    <div className="grid grid-cols-2 gap-x-4">
      {MOUSE_MODE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2">
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? 'border-line-hover' : 'border-line'
            }`}
          >
            {value === opt.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </span>
          <input
            type="radio"
            name="mouseMode"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm leading-none text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

/** 关系图边型：正交（四向落点）/ 曲线（从节点边缘发散） */
export function EdgeStyleRadio({
  value,
  onChange,
}: {
  value: EdgeStyle
  onChange: (v: EdgeStyle) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4">
      {EDGE_STYLE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2">
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? 'border-line-hover' : 'border-line'
            }`}
          >
            {value === opt.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </span>
          <input
            type="radio"
            name="edgeStyle"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm leading-none text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
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
    <div className="grid grid-cols-2 gap-x-4">
      {COVER_TINT_MODE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2">
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? 'border-line-hover' : 'border-line'
            }`}
          >
            {value === opt.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
          </span>
          <input
            type="radio"
            name="coverTintMode"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm leading-none text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}
