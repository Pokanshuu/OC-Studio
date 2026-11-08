'use client'

/**
 * 模板组件参数：轻量选项 + 「基本信息」组件选择器。
 *
 * **基本信息不是模板的一部分**：这里只负责从 `InfoGroup` 库里**选一个**，
 * 或者新建一个。字段的增删改在「自定义组件 › 基本信息」里做，入口是每行的设置键。
 *
 * 参数键 / 可选值 / 默认值来自 `lib/templates/params.ts`，这里只负责画。
 */
import { Plus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { inlineParamDefs, templateParamsFor } from '@/lib/templates/params'
import { createInfoGroup, selectableInfoGroups, useInfoGroups, type InfoGroup } from '@/lib/templates/info-groups'
import {
  createBodyGroup,
  selectableBodyGroups,
  useBodyGroups,
  type BodyGroup,
} from '@/lib/templates/body-groups'
import { bodyGroupIdOfTemplate } from '@/lib/templates/body-preset'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { ADD_ACTION, CHIP, ICON_BTN } from '@/lib/ui-tokens'

/** 行内参数：只放轻量选项（分段按钮） */
export function TemplateParamRow({
  component,
  onChange,
}: {
  component: TemplateComponent
  onChange: (key: string, value: string | number | boolean) => void
}) {
  const defs = inlineParamDefs(component.id)
  if (defs.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-3 py-2">
      {defs.map((def) => {
        const current = component.params?.[def.key] ?? def.fallback
        return (
          <div key={def.key} className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-faint">{def.label}</span>
            <div className="flex items-center gap-0.5">
              {def.options.map((option) => {
                const selected = current === option.value
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => onChange(def.key, option.value)}
                    aria-pressed={selected}
                    className={`${CHIP} ${
                      selected
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function nextGroupName(groups: readonly InfoGroup[]): string {
  const names = new Set(groups.map((group) => group.name))
  let name = '新基本信息组件'
  let counter = 2
  while (names.has(name)) {
    name = `新基本信息组件 ${counter}`
    counter += 1
  }
  return name
}

/**
 * 基本信息组件选择器：列出全部组件，选中即写模板的 `info.params.group`；
 * 每行右侧的设置键跳到组件编辑器；底部可以新建一个空组件。
 */
function InfoGroupPicker({
  doc,
  onSelect,
}: {
  doc: TemplateDoc
  onSelect: (groupId: string) => void
}) {
  const groups = useInfoGroups()
  const { openSettings } = useSettingsTrigger()
  const info = doc.components.find((component) => component.id === 'info')
  const groupId = typeof info?.params?.group === 'string' ? info.params.group : ''
  const legacyFields = !groupId && Array.isArray(info?.params?.fields) ? info?.params?.fields : undefined

  const create = (): void => {
    void createInfoGroup({ name: nextGroupName(groups) })
      .then((group) => {
        onSelect(group.id)
        openSettings('world', 'components', `group:${group.id}`)
      })
      .catch(() => {
        // 重名等失败由调用方 toast？这里保持静默，列表里再建
      })
  }

  /** 老数据的内联字段：一键收成组件，之后模板只存选择 */
  const saveLegacy = (): void => {
    void createInfoGroup({ name: nextGroupName(groups), fields: legacyFields ?? [] })
      .then((group) => {
        onSelect(group.id)
        openSettings('world', 'components', `group:${group.id}`)
      })
      .catch(() => {})
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5">
        <span className="text-[11px] text-ink-faint">基本信息组件</span>
      </div>

      <div className="flex flex-col rules-end">
        {groups.map((group) => {
          const selected = group.id === groupId
          return (
            <div
              key={group.id}
              className="row-rule flex items-center gap-1 px-3 py-1.5"
            >
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-ink-muted' : 'border-line'
                  }`}
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-ink-muted" /> : null}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${selected ? 'text-ink' : 'text-ink-muted'}`}>
                  {group.name}
                </span>
                <span className="shrink-0 text-[11px] text-ink-faint">{group.fields.length} 个字段</span>
              </button>
              <button
                type="button"
                onClick={() => openSettings('world', 'components', `group:${group.id}`)}
                title="编辑基本信息组件"
                aria-label={`编辑基本信息组件「${group.name}」`}
                className={`${ICON_BTN} shrink-0`}
              >
                <SlidersHorizontal size={13} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      {legacyFields !== undefined ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="min-w-0 truncate text-[12px] text-ink-faint">本模板内联字段（旧）</span>
          <button
            type="button"
            onClick={saveLegacy}
            className="shrink-0 text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            存为组件
          </button>
        </div>
      ) : null}

      <div className="px-3 pb-1">
        <button type="button" onClick={create} className={`${ADD_ACTION} mt-1 pl-0`}>
          <Plus size={13} strokeWidth={2} />
          新建基本信息组件
        </button>
      </div>
    </div>
  )
}

function nextBodyGroupName(groups: readonly BodyGroup[]): string {
  const names = new Set(groups.map((group) => group.name))
  let name = '新正文组件'
  let counter = 2
  while (names.has(name)) {
    name = `新正文组件 ${counter}`
    counter += 1
  }
  return name
}

/**
 * 正文组件选择器：与「基本信息组件」同一个交互 —— 列出可选组件、选中即写
 * `body.params.group`，每行右侧的设置键跳到骨架编辑器，底部可以新建一个。
 *
 * 与基础信息不同的是：正文组件可以「没有骨架」(`空`)，那也算一种正当选择。
 */
function BodyGroupPicker({
  doc,
  onSelect,
}: {
  doc: TemplateDoc
  onSelect: (groupId: string) => void
}) {
  const groups = useBodyGroups()
  const { openSettings } = useSettingsTrigger()
  const selectedId = bodyGroupIdOfTemplate(doc.id)
  const options = selectableBodyGroups(doc.id, groups)

  const create = (): void => {
    void createBodyGroup({ name: nextBodyGroupName(groups) })
      .then((group) => {
        onSelect(group.id)
        openSettings('world', 'components', `body:${group.id}`)
      })
      .catch((err: unknown) => {
        toast.error('新建失败', { description: err instanceof Error ? err.message : String(err) })
      })
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5">
        <span className="text-[11px] text-ink-faint">正文组件</span>
      </div>

      <div className="flex flex-col rules-end">
        {options.map((group) => {
          const selected = group.id === selectedId
          return (
            <div key={group.id} className="row-rule flex items-center gap-1 px-3 py-1.5">
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-ink-muted' : 'border-line'
                  }`}
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-ink-muted" /> : null}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${selected ? 'text-ink' : 'text-ink-muted'}`}>
                  {group.name}
                </span>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {group.markdown.trim() === '' ? '空' : '已设'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => openSettings('world', 'components', `body:${group.id}`)}
                title="编辑正文组件"
                aria-label={`编辑正文组件「${group.name}」`}
                className={`${ICON_BTN} shrink-0`}
              >
                <SlidersHorizontal size={13} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="px-3 pb-1">
        <button type="button" onClick={create} className={`${ADD_ACTION} mt-1 pl-0`}>
          <Plus size={13} strokeWidth={2} />
          新建正文组件
        </button>
      </div>
    </div>
  )
}

/**
 * 一个组件能编的全部参数。`info` 走组件选择器；其余组件走轻量参数行。
 * 没登记 / 没有消费方的组件返回 `null`（调用方据此决定是否显示设置按钮）。
 */
export function TemplateComponentParams({
  doc,
  component,
  onChange,
}: {
  doc: TemplateDoc
  component: TemplateComponent
  onChange: (key: string, value: string | number | boolean) => void
}) {
  const defs = templateParamsFor(doc.id, component.id, doc)
  if (component.id === 'info') {
    if (defs.length === 0) return null
    return <InfoGroupPicker doc={doc} onSelect={(groupId) => onChange('group', groupId)} />
  }
  if (component.id === 'body') {
    if (defs.length === 0) return null
    return <BodyGroupPicker doc={doc} onSelect={(groupId) => onChange('group', groupId)} />
  }
  if (defs.length === 0) return null
  return <TemplateParamRow component={component} onChange={onChange} />
}
