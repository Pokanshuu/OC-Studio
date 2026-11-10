'use client'

/**
 * 设置 › 世界 › 组件 › 关系 / 画廊 —— 组件参数的**独立配置面**。
 *
 * 为什么在这里：模板的组件参数（关系呈现方式、画廊列数 / 模式）以前只能在
 * `TemplateComposer` 的编排行里改，从设置里点「关系」却没东西可点。现在两级：
 * 先列**接受这组参数的模板**，点进去是那几个分段按钮。
 *
 * 参数的可编范围**完全由契约决定**（`lib/templates/params.ts`）：
 * `templateParamsFor` 说没有消费方就不出现，这里不自己写一份白名单。
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { templateParamsFor, type TemplateParamDef } from '@/lib/templates/params'
import { setTemplateComponentParams, useTemplates } from '@/lib/templates/store'
import { COMPONENT_BY_ID } from '@/lib/templates/registry'
import { TemplateTextParamRow } from '@/components/shared/TemplateParams'
import type { TemplateComponentId, TemplateDoc } from '@/lib/templates/types'
import { CHIP, CHIP_ON, ICON_BTN } from '@/lib/ui-tokens'

function ParamRow({
  def,
  doc,
  componentId,
}: {
  def: TemplateParamDef
  doc: TemplateDoc
  componentId: TemplateComponentId
}) {
  const component = doc.components.find((item) => item.id === componentId)
  const current = component?.params?.[def.key] ?? def.fallback

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] text-ink">{def.label}</span>
      <div className="flex items-center gap-0.5">
        {def.options.map((option) => {
          const selected = current === option.value
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                // 写回走 store（读当前缓存合并）：连点两个参数不会互相覆盖
                void setTemplateComponentParams(doc.id, componentId, { [def.key]: option.value }).catch(
                  (err: unknown) => {
                    toast.error('参数保存失败', { description: err instanceof Error ? err.message : String(err) })
                  },
                )
              }}
              className={
                selected ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TemplateParamPanel({
  componentId,
  onBack,
}: {
  componentId: TemplateComponentId
  onBack: () => void
}) {
  const { templates } = useTemplates()
  const [activeId, setActiveId] = useState<string | null>(null)

  /** 只有真正消费这组参数的模板才出现（契约说了算，不在这里另写一份名单） */
  const rows = useMemo(
    () =>
      templates
        .map((doc) => ({ doc, defs: templateParamsFor(doc.id, componentId, doc) }))
        .filter((row) => row.defs.length > 0),
    [templates, componentId],
  )

  const active = rows.find((row) => row.doc.id === activeId) ?? null
  const label = COMPONENT_BY_ID[componentId]?.label ?? componentId

  if (!active) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 pb-1">
          <button type="button" onClick={onBack} aria-label="返回" className={ICON_BTN}>
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-sm text-ink">{label}</span>
        </div>

        {rows.length === 0 ? (
          <p className="py-3 text-[12px] text-ink-faint">没有模板用到这一组参数</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.doc.id}
              type="button"
              onClick={() => setActiveId(row.doc.id)}
              className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors hover:bg-[var(--oc-hover)]"
            >
              <span>{row.doc.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                {row.defs.length} 项
                <ChevronRight size={16} strokeWidth={2} />
              </span>
            </button>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setActiveId(null)} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-sm font-medium text-ink">{active.doc.name}</span>
      </div>
      <div className="flex flex-col">
        {active.defs
          .filter((def) => def.kind === 'choice')
          .map((def) => (
            <ParamRow key={def.key} def={def} doc={active.doc} componentId={componentId} />
          ))}
        {active.doc.components
          .filter((component) => component.id === componentId)
          .flatMap((component) =>
            active.defs
              .filter((def) => def.kind === 'text')
              .map((def) => (
                <TemplateTextParamRow
                  key={`${active.doc.id}-${def.key}`}
                  def={def}
                  component={component}
                  onChange={(key, value) => {
                    void setTemplateComponentParams(active.doc.id, componentId, { [key]: value }).catch(
                      (err: unknown) => {
                        toast.error('参数保存失败', { description: err instanceof Error ? err.message : String(err) })
                      },
                    )
                  }}
                />
              )),
          )}
      </div>
    </div>
  )
}
