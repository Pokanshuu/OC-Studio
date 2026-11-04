'use client'

/**
 * 封面卡参数面板（调试用）。
 *
 * 「视图 → 封面卡参数」或 `Ctrl/Cmd + Shift + K` 打开。拖滑杆时所有封面卡实时重画，
 * 调好点「复制参数」把 JSON 发出来即可 —— 参数存在 localStorage，刷新不丢。
 *
 * 面板本身也是界面，走同一套令牌：PANEL / ICON_BTN / CHIP / ROUND_*。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, RotateCcw, X } from 'lucide-react'
import {
  COVER_ASPECT_OPTIONS,
  COVER_TINT_MODE_OPTIONS,
  COVER_TUNING_RANGES,
  coverTuningJson,
  resetCoverTuning,
  toggleCoverTuningPanel,
  updateCoverTuning,
  useCoverTuning,
  useCoverTuningPanelOpen,
  type CoverSliderKey,
} from '@/lib/cover'
import { CHIP, CHIP_ON, ICON_BTN, PANEL } from '@/lib/ui-tokens'
import { useSettings } from '@/lib/settings'

export function CoverTuningPanel() {
  const open = useCoverTuningPanelOpen()
  const tuning = useCoverTuning()
  // 彩色 / 黑白是用户设置（设置 → 封面卡混色），面板这里只是给个顺手的入口
  const { settings, updateSetting } = useSettings()
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return
      if (event.key !== 'k' && event.key !== 'K') return
      event.preventDefault()
      toggleCoverTuningPanel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  const copy = useCallback(async () => {
    const text = coverTuningJson()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板不可用时，文本框本身就够复制了
    }
    setCopied(true)
    if (copiedTimer.current !== undefined) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }, [])

  if (!open) return null

  return (
    <div className={`fixed right-3 top-14 z-40 w-[264px] ${PANEL}`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex-1 text-[13px] font-medium text-ink">封面卡参数</span>
        <button type="button" onClick={() => void copy()} className={ICON_BTN} title="复制参数">
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
        </button>
        <button type="button" onClick={resetCoverTuning} className={ICON_BTN} title="恢复默认">
          <RotateCcw size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => toggleCoverTuningPanel()}
          className={ICON_BTN}
          title="关闭"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="max-h-[68vh] overflow-y-auto px-3 py-2">
        <div className="mb-2 flex items-center gap-1">
          <span className="w-16 shrink-0 text-[11px] text-ink-muted">比例</span>
          <div className="flex flex-1 gap-1">
            {COVER_ASPECT_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => updateCoverTuning({ aspect: option.value })}
                className={tuning.aspect === option.value ? `${CHIP_ON} flex-1 justify-center` : `${CHIP} flex-1 justify-center`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2 flex items-center gap-1">
          <span className="w-16 shrink-0 text-[11px] text-ink-muted">混色</span>
          <div className="flex flex-1 gap-1">
            {COVER_TINT_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateSetting('coverTintMode', option.value)}
                className={settings.coverTintMode === option.value ? `${CHIP_ON} flex-1 justify-center` : `${CHIP} flex-1 justify-center`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {(Object.keys(COVER_TUNING_RANGES) as CoverSliderKey[]).map((key) => {
          const range = COVER_TUNING_RANGES[key]
          return (
            <label key={key} className="mb-1.5 flex flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-ink-muted">{range.label}</span>
                <span className="text-[11px] tabular-nums text-ink-faint">
                  {tuning[key]}
                  {range.unit}
                </span>
              </span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={tuning[key]}
                onChange={(event) => updateCoverTuning({ [key]: Number(event.target.value) })}
                className="h-3 w-full cursor-ew-resize"
                style={{ accentColor: 'var(--oc-ink)' }}
              />
            </label>
          )
        })}
      </div>

      <div className="border-t border-line px-3 py-2">
        <textarea
          readOnly
          value={coverTuningJson()}
          onFocus={(event) => event.currentTarget.select()}
          className="h-20 w-full resize-none bg-transparent font-mono text-[10px] leading-[1.5] text-ink-faint focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  )
}

