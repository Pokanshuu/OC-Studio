'use client'

import { EDITOR_LAYOUT_OPTIONS, type EditorLayout } from "@/lib/editor-layout"

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
              value === opt.value ? 'border-ink' : 'border-line'
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
              value === opt.value ? 'border-ink' : 'border-line'
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
              value === opt.value ? 'border-ink' : 'border-line'
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
