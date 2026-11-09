'use client'

/**
 * 模板组件参数：轻量选项 + 「基本信息」组件选择器。
 *
 * **基本信息不是模板的一部分**：这里只负责从 `InfoGroup` 库里**选一个**，
 * 或者新建一个。字段的增删改在「自定义组件 › 基本信息」里做，入口是每行的设置键。
 *
 * 参数键 / 可选值 / 默认值来自 `lib/templates/params.ts`，这里只负责画。
 */
import { useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { templateParamsFor, type TemplateParamDef } from '@/lib/templates/params'
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
import { ADD_ACTION, CHIP, ICON_BTN, INPUT_LINE } from '@/lib/ui-tokens'

/**
 * 行内参数：只放轻量选项（分段按钮）。
 *
 * `defs` 由调用方从 `templateParamsFor` 拿——**已经按宿主过滤过**；
 * 不要在这里重新按组件 id 算一遍，否则会给「这一宿主不消费」的参数也画按钮。
 */
export function TemplateParamRow({
  component,
  defs,
  onChange,
}: {
  component: TemplateComponent
  defs: TemplateParamDef[]
  onChange: (key: string, value: string | number | boolean) => void
}) {
  const rows = defs.filter((def) => def.kind === 'choice')
  if (rows.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-3 py-2">
      {rows.map((def) => {
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

/**
 * 文本参数（目前只有「标题文案」）：失焦 / 回车保存，清空 = 恢复默认文案。
 *
 * 标题文案是**模板级**的，不是这一篇笔记的；`key` 由调用方带上 `doc.id`，
 * 切模板时整个输入框重来，避免把上一份模板的草稿带过去。
 */
export function TemplateTextParamRow({
  def,
  component,
  onChange,
}: {
  def: TemplateParamDef
  component: TemplateComponent
  onChange: (key: string, value: string) => void
}) {
  const saved = typeof component.params?.[def.key] === 'string' ? (component.params[def.key] as string) : ''
  const [draft, setDraft] = useState(saved)
  const commit = (): void => {
    const next = draft.trim()
    if (next === saved) return
    onChange(def.key, next)
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0">
      <span className="text-[13px] text-ink">{def.label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        placeholder="默认"
        aria-label={def.label}
        className={`${INPUT_LINE} max-w-[180px]`}
      />
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
 * 基本信息组件选择器：**只给笔记宿主**（词条 / 宠物 / 武器 / 自建模板）。
 *
 * 列型宿主（角色 / 事件）的字段表是全局唯一真源、模板只是引用它，选了也不生效 ——
 * 参数层就不向它们开放（`params.ts` 的 `templateAcceptsParam`），这里自然不会被展开；
 * 跳字段表的入口是编辑器「基本信息」标题行的悬停设置键。
 *
 * 列表按宿主过滤（`selectableInfoGroups`）：自建组件的字段是自建键，不能出现在
 * 实体宿主里，反之亦然。
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
  // 老数据的内联字段有两种写法：数组，或逗号串（`fields: 物种,习性`）。
  // 认不出来就等于「设置里看不见、渲染却在用」，所以两种都收。
  const rawLegacyFields = groupId === '' ? info?.params?.fields : undefined
  const parsedLegacy = Array.isArray(rawLegacyFields)
    ? rawLegacyFields.filter((item): item is string => typeof item === 'string')
    : typeof rawLegacyFields === 'string'
      ? rawLegacyFields.split(/[,，、]/).map((item) => item.trim()).filter((item) => item !== '')
      : undefined
  const legacyFields = parsedLegacy !== undefined && parsedLegacy.length > 0 ? parsedLegacy : undefined

  const current = groups.find((group) => group.id === groupId)
  const candidates = selectableInfoGroups(doc.id, groups)
  // 历史上选过、但现在不在候选里的组件仍列出来（否则看不到也换不掉）
  const list =
    current && !candidates.some((group) => group.id === current.id)
      ? [current, ...candidates]
      : candidates

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
        {list.map((group) => {
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

      <p className="px-3 pb-1 pt-0.5 text-[11px] text-ink-faint">
        骨架只铺给新建的条目，已有正文不动。
      </p>

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
  const choiceDefs = defs.filter((def) => def.kind === 'choice')
  const textDefs = defs.filter((def) => def.kind === 'text')
  return (
    <div className="flex flex-col">
      {choiceDefs.length > 0 ? (
        <TemplateParamRow component={component} defs={choiceDefs} onChange={onChange} />
      ) : null}
      {textDefs.map((def) => (
        <TemplateTextParamRow
          key={`${doc.id}-${def.key}`}
          def={def}
          component={component}
          onChange={onChange}
        />
      ))}
    </div>
  )
}
