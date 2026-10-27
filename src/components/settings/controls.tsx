'use client'

/** 设置页的共享控件：主题单选 + 开关样式常量（被「通用」等 tab 使用）。 */
export const THEME_OPTIONS = [
  { value: "light", label: "白天模式" },
  { value: "dark", label: "夜间模式" },
  { value: "auto", label: "跟随系统" },
] as const

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
          <div
            className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              value === opt.value ? "border-line-hover" : "border-line"
            } bg-[var(--oc-hover)]`}
          >
            {value === opt.value && (
              <div className="h-2 w-2 rounded-full bg-ink-muted" />
            )}
          </div>
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm text-ink">{opt.label}</span>
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

