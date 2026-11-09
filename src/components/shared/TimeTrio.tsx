'use client'

/**
 * 年 / 月 / 日 三段输入 —— 事件与词条的时间字段共用，**只有这一份**。
 *
 * 以前它是「时间」组件（`TimeBlock`）的内部实现；时间改成基本信息里的一行之后，
 * 组件没了、控件还在：这里只剩画三个输入框和回调，解析 / 拼装仍走 `lib/time-field`，
 * 值由调用方持有。字段行已经自带底线，所以这里不再画线（画了就是双线）。
 */
import { DATE_INPUT } from '@/lib/ui-tokens'
import type { ParsedTime } from '@/lib/time-field'

export type TimePart = keyof ParsedTime

const PARTS: { part: TimePart; label: string }[] = [
  { part: 'year', label: '年' },
  { part: 'month', label: '月' },
  { part: 'day', label: '日' },
]

export function TimeTrio({
  values,
  onChange,
}: {
  values: ParsedTime
  onChange: (part: TimePart, value: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {PARTS.map(({ part, label }) => (
        <input
          key={part}
          value={values[part]}
          onChange={(event) => onChange(part, event.target.value)}
          placeholder={label}
          aria-label={label}
          className={DATE_INPUT}
        />
      ))}
    </div>
  )
}
