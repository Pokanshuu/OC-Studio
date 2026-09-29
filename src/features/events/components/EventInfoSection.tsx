'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import type { EventForm } from '../hooks/useEventForm'

// 字段行统一样式见 @/lib/ui-tokens
const FIELD_INPUT = 'h-6 w-14 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none'

/** 基本信息：开始 / 结束（年-月-日）· 地点 · 重大事件 */
export function EventInfoSection({ form }: { form: EventForm }) {
  return (
    <section>
      <h3 className={SECTION_TITLE}>基本信息</h3>
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        <div className={FIELD_ROW}>
          <span className={FIELD_LABEL}>开始</span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input value={form.year} onChange={(e) => form.setYear(e.target.value)} placeholder="年" className={FIELD_INPUT} />
            <input value={form.month} onChange={(e) => form.setMonth(e.target.value)} placeholder="月" className={FIELD_INPUT} />
            <input value={form.day} onChange={(e) => form.setDay(e.target.value)} placeholder="日" className={FIELD_INPUT} />
          </div>
        </div>

        <div className={FIELD_ROW}>
          <span className={FIELD_LABEL}>结束</span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input value={form.endYear} onChange={(e) => form.setEndYear(e.target.value)} placeholder="年" className={FIELD_INPUT} />
            <input value={form.endMonth} onChange={(e) => form.setEndMonth(e.target.value)} placeholder="月" className={FIELD_INPUT} />
            <input value={form.endDay} onChange={(e) => form.setEndDay(e.target.value)} placeholder="日" className={FIELD_INPUT} />
          </div>
        </div>

        <div className={FIELD_ROW}>
          <span className={FIELD_LABEL}>地点</span>
          <input
            type="text"
            value={form.location}
            onChange={(e) => form.setLocation(e.target.value)}
            placeholder="地点"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>

        <label className={`${FIELD_ROW} cursor-pointer`}>
          <span className={FIELD_LABEL}>重大事件</span>
          <Checkbox checked={form.isMajor} onCheckedChange={(checked) => form.setIsMajor(checked === true)} />
        </label>
      </div>
    </section>
  )
}
