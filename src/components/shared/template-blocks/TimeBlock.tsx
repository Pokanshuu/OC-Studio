'use client'

/**
 * 时间组件 —— 事件与词条共用（`docs/模板.md §6.7`）。
 *
 * 呈现是「年 / 月 / 日」三段输入，整组一条底线；`区间` 打开时右边再接一组
 * （用「至」连接）。解析 / 拼装只走 `lib/time-field.ts`，组件里不自己拆字符串。
 *
 * 纯呈现：值由调用方持有（事件表单的 year/month/day、词条的自持久化块），
 * 这里只负责画和回调，不碰数据库。
 */
import { DATE_INPUT } from '@/lib/ui-tokens'
import type { ParsedTime } from '@/lib/time-field'
import { ComponentSection } from '../ComponentSection'

export type TimePart = keyof ParsedTime

interface TimeBlockProps {
  start: ParsedTime
  end: ParsedTime
  /** 显示「至」与第二组（不需要结束时间就关掉） */
  interval?: boolean
  showTitle?: boolean
  title?: string
  onChange: (which: 'start' | 'end', part: TimePart, value: string) => void
}

function Trio({
  values,
  onChange,
}: {
  values: ParsedTime
  onChange: (part: TimePart, value: string) => void
}) {
  const labels: { part: TimePart; label: string }[] = [
    { part: 'year', label: '年' },
    { part: 'month', label: '月' },
    { part: 'day', label: '日' },
  ]
  return (
    <div className="flex items-center gap-1 border-b border-line pb-1">
      {labels.map(({ part, label }) => (
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

export function TimeBlock({
  start,
  end,
  interval = true,
  showTitle = true,
  title = '时间',
  onChange,
}: TimeBlockProps) {
  return (
    <ComponentSection title={showTitle ? title : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Trio values={start} onChange={(part, value) => onChange('start', part, value)} />
        {interval ? (
          <>
            <span className="text-sm text-ink-faint">至</span>
            <Trio values={end} onChange={(part, value) => onChange('end', part, value)} />
          </>
        ) : null}
      </div>
    </ComponentSection>
  )
}
