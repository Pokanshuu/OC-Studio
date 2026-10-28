'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BTN_PRIMARY, BTN_QUIET, CHIP, CHIP_ON, INPUT_LINE, PAGE_TITLE } from '@/lib/ui-tokens'
import type { RelationDraft } from './relation-graph-utils'

interface RelationCreateDialogProps {
  draft: RelationDraft
  saving: boolean
  onCancel: () => void
  onSubmit: (relation: string) => void
}

/**
 * 关系图拖拽连线后的确认层：显示「谁 → 谁」，让用户决定关系名。
 * 成员关系（参与 / 所属 / 发生于 / 发生地）没有自由文本，只回显固定关系名。
 */
export function RelationCreateDialog({ draft, saving, onCancel, onSubmit }: RelationCreateDialogProps) {
  const [relation, setRelation] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!draft.plan.fixedLabel) inputRef.current?.focus()
  }, [draft])

  const fixedLabel = draft.plan.fixedLabel
  const submit = () => onSubmit(fixedLabel ?? relation)

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={PAGE_TITLE}>添加关系</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-[13px]">
          <span className="min-w-0 truncate text-ink">{draft.source.label}</span>
          <ArrowRight size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <span className="min-w-0 truncate text-ink">{draft.target.label}</span>
        </div>

        {fixedLabel ? (
          <div>
            <span className={CHIP}>{fixedLabel}</span>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="关系"
              aria-label="关系名"
              className={INPUT_LINE}
            />
            {draft.plan.presets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {draft.plan.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRelation(preset)}
                    className={relation === preset ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className={BTN_QUIET}>
            取消
          </button>
          <button type="button" onClick={submit} disabled={saving} className={BTN_PRIMARY}>
            <Check size={14} strokeWidth={2} />
            <span>添加</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
