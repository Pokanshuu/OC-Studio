'use client'

import { useState, useMemo } from 'react'
import { Check } from 'lucide-react'
import type { Period } from '@/types'
import { PERIOD_COLORS } from '@/types'
import { parseTime, assembleTime, parseYear } from '@/features/events/utils'
import { FIELD_LABEL_BLOCK, INPUT_LINE, PAGE_TITLE } from '@/lib/ui-tokens'

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

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/15 dark:bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[440px] max-md:w-[calc(100%-2rem)] border border-line bg-paper/85 dark:bg-paper/85 p-6 backdrop-blur-lg">
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
          <div className="flex items-center gap-2 max-md:flex-col max-md:items-start">
            <div className="flex items-center gap-2">
              <input type="text" value={startYear} onChange={(e) => setStartYear(e.target.value)} placeholder="年" className={`w-16 ${INPUT_LINE}`} />
              <input type="text" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} placeholder="月" className={`w-12 ${INPUT_LINE}`} />
              <input type="text" value={startDay} onChange={(e) => setStartDay(e.target.value)} placeholder="日" className={`w-12 ${INPUT_LINE}`} />
              <span className="text-[11px] text-ink-faint">→</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="年" className={`w-16 ${INPUT_LINE}`} />
              <input type="text" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="月" className={`w-12 ${INPUT_LINE}`} />
              <input type="text" value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="日" className={`w-12 ${INPUT_LINE}`} />
            </div>
          </div>
        </div>

        {/* Color picker */}
        <div className="mb-5">
          <label className={FIELD_LABEL_BLOCK}>底色</label>
          <div className="flex gap-3">
            {PERIOD_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                title={c.label}
                className={`h-6 w-6 ${c.value} transition-all ${
                  color === c.value
                    ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper'
                    : ''
                }`}
              />
            ))}
          </div>
        </div>

        {error ? (
          <p className="mb-3 text-[12px] text-error">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="touch-feedback flex h-8 items-center px-3 text-[13px] text-ink-muted transition-colors hover:text-ink"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40"
          >
            <Check size={14} strokeWidth={2} />
            <span>{saving ? '保存中...' : '确认'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
