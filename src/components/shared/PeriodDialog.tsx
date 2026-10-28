'use client'

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { Period } from '@/types'
import { PERIOD_COLORS } from '@/types'
import { parseTime, assembleTime, parseYear } from '@/features/events/utils'
import { BTN_PRIMARY, BTN_QUIET, FIELD_LABEL_BLOCK, INPUT_LINE, PAGE_TITLE, PANEL } from '@/lib/ui-tokens'

/** 日期段：整组共用一条底线（与事件编辑器的年/月/日 同一语言），段内不再各自画线 */
const DATE_GROUP = 'flex min-w-0 flex-1 items-center gap-1.5 border-b border-line transition-colors focus-within:border-line-hover'
const DATE_INPUT = 'min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none'
const DATE_YEAR = `${DATE_INPUT} flex-[3]`

interface PeriodDialogProps {
  open: boolean
  period?: Period
  onSave: (data: { name: string; startTime: string; endTime: string; color: string }) => void
  onClose: () => void
}

export function PeriodDialog({ open, period, onSave, onClose }: PeriodDialogProps) {
  const initialStart = useMemo(() => parseTime(period?.startTime ?? ''), [period?.startTime])
  const initialEnd = useMemo(() => parseTime(period?.endTime ?? ''), [period?.endTime])

  const [name, setName] = useState(period?.name ?? '')
  const [startYear, setStartYear] = useState(initialStart.year)
  const [startMonth, setStartMonth] = useState(initialStart.month)
  const [startDay, setStartDay] = useState(initialStart.day)
  const [endYear, setEndYear] = useState(initialEnd.year)
  const [endMonth, setEndMonth] = useState(initialEnd.month)
  const [endDay, setEndDay] = useState(initialEnd.day)
  const [color, setColor] = useState(period?.color ?? PERIOD_COLORS[0].value)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const startTime = assembleTime(startYear, startMonth, startDay)
  const endTime = assembleTime(endYear, endMonth, endDay)
  const canSave = name.trim() && startTime && endTime && !saving

  const handleSave = async () => {
    if (!canSave) return
    const sYear = parseYear(startTime) ?? 0
    const eYear = parseYear(endTime) ?? 0
    if (sYear > eYear || (sYear === eYear && startTime > endTime)) {
      setError('开始时间不能晚于结束时间')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), startTime, endTime, color })
      onClose()
    } catch {
      setError('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const dialog = (
    <div
      className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/15 dark:bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`w-[440px] max-md:w-[calc(100%-2rem)] p-6 ${PANEL}`}>
        <h2 className={`mb-5 ${PAGE_TITLE}`}>
          {period ? '编辑时期' : '添加时期'}
        </h2>

        {/* Name */}
        <div className="mb-4">
          <label className={FIELD_LABEL_BLOCK}>名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="时期名称"
            className={INPUT_LINE}
          />
        </div>

        {/* Start & End time */}
        <div className="mb-4">
          <label className={FIELD_LABEL_BLOCK}>开始 / 结束时间</label>
          <div className="flex items-center gap-3 max-md:flex-col max-md:items-stretch max-md:gap-2">
            <div className={DATE_GROUP}>
              <input type="text" value={startYear} onChange={(e) => setStartYear(e.target.value)} placeholder="年" className={DATE_YEAR} />
              <input type="text" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} placeholder="月" className={DATE_INPUT} />
              <input type="text" value={startDay} onChange={(e) => setStartDay(e.target.value)} placeholder="日" className={DATE_INPUT} />
            </div>
            <span className="shrink-0 self-center text-[12px] text-ink-faint">→</span>
            <div className={DATE_GROUP}>
              <input type="text" value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="年" className={DATE_YEAR} />
              <input type="text" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="月" className={DATE_INPUT} />
              <input type="text" value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="日" className={DATE_INPUT} />
            </div>
          </div>
        </div>

        {/* Color picker */}
        <div className="mb-5">
          <label className={FIELD_LABEL_BLOCK}>底色</label>
          <div className="flex gap-2">
            {PERIOD_COLORS.map((c) => {
              const selected = color === c.value
              // 色点选中环用 ring（1px + 外留 2px 空隙）：它不是焦点光晕，是「这颗被选中了」
              const swatch = `h-6 w-6 rounded-full ring-1 transition-all focus:outline-none ${c.value} ${ // design-audit-allow focus-ring 色点选中环
                selected
                  ? 'ring-ink ring-offset-2 ring-offset-paper'
                  : 'ring-transparent hover:ring-line-hover'
              }`
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={selected}
                  className={swatch}
                />
              )
            })}
          </div>
        </div>

        {error ? (
          <p className="mb-3 text-[12px] text-error">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={BTN_QUIET}>
            取消
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className={BTN_PRIMARY}>
            <Check size={14} strokeWidth={2} />
            <span>{saving ? '保存中...' : '确认'}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return overlayRoot ? createPortal(dialog, overlayRoot) : dialog
}
