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
    <div className="flex gap-3">
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
    <div className="flex gap-3">
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

/** 官方主题选择：一块「纸 + 两行墨」的小样，选中的那块抬起 */
export function ThemePresetRadio({
  value,
  onChange,
  // 主题现在是插件（`lib/plugins/themes.ts`）：关掉的那套不出选项，由调用方过滤后传进来
  presets = THEME_PRESETS,
}: {
  value: ThemePresetId
  onChange: (v: ThemePresetId) => void
  presets?: readonly ThemePreset[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const selected = value === preset.id
        return (
          <label
            key={preset.id}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-control border px-2 py-2 focus-within:border-line-hover ${
              selected ? 'border-line-hover bg-[var(--oc-hover)]' : 'border-line'
            }`}
          >
            <span
              className="flex h-7 w-12 flex-col justify-center gap-1 rounded-item border border-line px-1.5"
              style={{ background: preset.preview.paper }}
              aria-hidden
            >
              <span className="h-[2px] w-full rounded-full" style={{ background: preset.preview.ink }} />
              <span className="h-[2px] w-2/3 rounded-full" style={{ background: preset.preview.ink, opacity: 0.5 }} />
            </span>
            <input
              type="radio"
              name="themePreset"
              value={preset.id}
              checked={selected}
              onChange={() => onChange(preset.id as ThemePresetId)}
              className="sr-only"
            />
            <span className={`text-[12px] leading-none ${selected ? 'text-ink' : 'text-ink-muted'}`}>
              {preset.name}
            </span>
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
  { value: 'left-pan', label: '左键平移 · Shift 框选' },
  { value: 'right-pan', label: '右键平移 · 左键框选' },
]

/** 关系图鼠标模式：左键平移 / 右键平移（框选入口随之切换） */
export function MouseModeRadio({
  value,
  onChange,
}: {
  value: 'left-pan' | 'right-pan'
  onChange: (v: 'left-pan' | 'right-pan') => void
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
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
    <div className="flex gap-3">
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
    <div className="flex gap-3">
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
