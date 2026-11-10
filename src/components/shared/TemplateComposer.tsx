'use client'

/**
 * 模板编排层（`docs/模板.md §8`）：全宽覆盖层，三栏。
 *
 * ```
 * ┌──────────── 顶栏：← 模板名 ────────────┐
 * │ 模板列表 │  组件编排（拖 / 移 / 加）  │ 结构预览 │
 * └────────────────────────────────────────┘
 * ```
 *
 * 为什么是全宽而不是塞进 640px 的设置弹窗：三栏在弹窗里做不出来，硬塞就是滑动地狱。
 * 入口仍在设置里 —— 它属于设置，不属于创作。
 *
 * 预览是**结构预览**（这一版）：按真实顺序画区块、真实的分隔线节奏、真实标题，
 * 但不假装填充内容 —— 内容要真实，就得拿一篇真实笔记来渲染，那是编辑器的活。
 */
import { worldBodyOf } from '@/lib/world-body'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Download, Plus, SlidersHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import { COMPONENT_BY_ID, COMPONENT_IDS } from '@/lib/templates/registry'
import { isComponentAvailable, isComponentWired } from '@/lib/templates/support'
import { templateParamsFor } from '@/lib/templates/params'
import { templateFieldKeys, templateFieldTypes } from '@/lib/templates/fields'
import {
  infoFieldColumnOf,
  infoFieldLabelOf,
  useInfoGroups,
  type InfoGroup,
} from '@/lib/templates/info-groups'
import { useBodyGroups } from '@/lib/templates/body-groups'
import { bodyGroupIdOfTemplate } from '@/lib/templates/body-preset'
import { componentEditTarget } from '@/lib/templates/edit-target'
import { saveTemplate, setTemplateComponentParams, useTemplates } from '@/lib/templates/store'
import type { TemplateComponent, TemplateComponentId, TemplateDoc } from '@/lib/templates/types'
import type { TemplateParamValue } from '@/lib/templates/params'
import { db } from '@/lib/db'
import { useCategories } from '@/lib/categories/store'
import type { Category } from '@/lib/categories/types'
import { isCodexEntry } from '@/lib/entry-kinds'
import { resolveImageUrl } from '@/lib/image-service'
import { useExportCenter } from './export/ExportCenterHost'
import type { PosterSubjectKind } from '@/lib/export/poster/subjects'
import { ComponentSection } from './ComponentSection'
import { TemplateComponentParams } from './TemplateParams'
import { FullscreenViewer } from './FullscreenViewer'
import { DragHandle, SortableList, moveId, useSortableItem } from './list-dnd'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { BTN_PRIMARY, BTN_QUIET, CHIP, ICON_BTN, MENU_ITEM, PANEL, SECTION_TITLE_BARE } from '@/lib/ui-tokens'

interface PreviewRelation {
  label: string
  id?: number
  type?: string
}

interface PreviewData {
  title: string
  cover?: string
  avatar?: string
  image?: string
  summary: string
  fields: [string, string][]
  tags: string[]
  body: string
  relations: string[]
  relationTargets: PreviewRelation[]
  gallery: string[]
  galleryImages: string[]
  time: string
  location: string
  /** 导出图片时直接定位到这一条（导出中心按 kind + id 重新读数据） */
  subjectKind: PosterSubjectKind
  subjectId: number
}

/** 正文可能是 Tiptap JSON 字符串，也可能是 HTML；预览只要纯文本 */
function plainTextOf(value: string): string {
  const text = value.trim()
  if (text === '') return ''
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const root = JSON.parse(text) as unknown
      const out: string[] = []
      const visit = (node: unknown): void => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const item of node) visit(item)
          return
        }
        const record = node as Record<string, unknown>
        if (record.type === 'text' && typeof record.text === 'string') out.push(record.text)
        for (const child of Object.values(record)) visit(child)
      }
      visit(root)
      if (out.length > 0) return out.join(' ').replace(/\s+/g, ' ').trim()
    } catch {
      // 不是 JSON，按 HTML / 纯文本处理
    }
  }
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function tagNamesOf(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db.tags.bulkGet(ids)
  return rows.map((tag) => tag?.name.trim() ?? '').filter((name) => name !== '')
}

function plainDocument(value: unknown): string {
  if (typeof value === 'string') return plainTextOf(value)
  if (value === null || value === undefined) return ''
  try {
    return plainTextOf(JSON.stringify(value))
  } catch {
    return ''
  }
}

function recentFirst<T extends { updatedAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 拿一条真实数据做预览：角色 / 事件 / 国家，或最近一篇对应模板的笔记 */
async function loadPreview(
  template: TemplateDoc,
  categories: Category[],
  groups: readonly InfoGroup[],
): Promise<PreviewData | null> {
  const empty = {
    relations: [] as string[],
    relationTargets: [] as PreviewRelation[],
    gallery: [] as string[],
    galleryImages: [] as string[],
    time: '',
    location: '',
  }

  if (template.id === 'character') {
    const character = recentFirst(await db.characters.filter((row) => !row.deleted).toArray())[0]
    if (!character) return null
    const fields = (
      [
        ['种族', character.race],
        ['元素', character.element],
        ['职业', character.occupation],
      ] as [string, string][]
    ).filter(([, value]) => value.trim() !== '')
    return {
      ...empty,
      subjectKind: 'character',
      subjectId: character.id,
      title: character.name || '未命名',
      cover: character.headerUrl,
      avatar: character.avatarUrl,
      summary: plainTextOf(character.bio),
      body: plainTextOf(character.lifeStory),
      fields,
      tags: await tagNamesOf(character.tags),
      relations: character.relatedCharacters.map((relation) => `${relation.name} · ${relation.relation}`),
      relationTargets: character.relatedCharacters.map((relation) => ({
        label: `${relation.name} · ${relation.relation}`,
        id: relation.characterId,
        type: 'character',
      })),
      gallery: character.gallery.map((image) => image.caption || '图片'),
      galleryImages: character.gallery.map((image) => image.url),
    }
  }

  if (template.id === 'event') {
    const event = recentFirst(await db.events.filter((row) => !row.deleted).toArray())[0]
    if (!event) return null
    const fields = (
      [
        ['时间', event.time],
        ['地点', event.location],
      ] as [string, string][]
    ).filter(([, value]) => value.trim() !== '')
    // 关系区块包含参与者（角色 / 国家）与相关事件，预览按同一顺序取真实名字
    const [participantRows, relatedRows] = await Promise.all([
      Promise.all([
        ...(event.characters ?? []).map((id) => db.characters.get(id)),
        ...(event.countries ?? []).map((id) => db.countries.get(id)),
      ]),
      Promise.all((event.relations ?? []).map((relation) => db.events.get(relation.targetId))),
    ])
    const relationTargets: PreviewRelation[] = [
      ...(event.characters ?? []).flatMap((id, index) => {
        const target = participantRows[index]
        return target && !target.deleted
          ? [{ label: `${target.name} · 参与`, id, type: 'character' }]
          : []
      }),
      ...(event.countries ?? []).flatMap((id, index) => {
        const target = participantRows[(event.characters ?? []).length + index]
        return target && !target.deleted
          ? [{ label: `${target.name} · 发生于`, id, type: 'country' }]
          : []
      }),
      ...(event.relations ?? []).flatMap((relation, index) => {
        const target = relatedRows[index]
        return target && !target.deleted
          ? [{ label: `${target.title} · ${relation.relation}`, id: relation.targetId, type: 'event' }]
          : []
      }),
    ]
    return {
      ...empty,
      subjectKind: 'event',
      subjectId: event.id,
      title: event.title || '未命名',
      cover: event.headerUrl,
      summary: plainTextOf(event.summary),
      body: plainTextOf(event.content),
      fields,
      tags: await tagNamesOf(event.tags),
      relations: relationTargets.map((relation) => relation.label),
      relationTargets,
      gallery: event.images.map((image) => image.caption || '图片'),
      galleryImages: event.images.map((image) => image.url),
      time: event.time,
      location: event.location,
    }
  }

  if (template.id === 'country') {
    const country = recentFirst(await db.countries.filter((row) => !row.deleted).toArray())[0]
    if (!country) return null
    const fields = (
      [
        ['体制', country.system],
        ['地理', country.geography],
        ['文化', country.culture],
      ] as [string, string][]
    ).filter(([, value]) => value.trim() !== '')
    // 名单不再存在国家行上（阶段二·一）：预览按实体侧查询，与编辑器同一份数据
    const [memberCharacters, memberEvents] = await Promise.all([
      db.characters.filter((row) => !row.deleted && row.countryId === country.id).toArray(),
      db.events.filter((row) => !row.deleted && (row.countries ?? []).includes(country.id)).toArray(),
    ])
    const relationTargets: PreviewRelation[] = [
      ...memberCharacters.map((member) => ({
        label: `${member.name} · 属于`,
        id: member.id,
        type: 'character',
      })),
      ...memberEvents.map((item) => ({
        label: `${item.title} · 发生于`,
        id: item.id,
        type: 'event',
      })),
    ]
    return {
      ...empty,
      subjectKind: 'country',
      subjectId: country.id,
      title: country.name || '未命名',
      cover: country.headerUrl || country.flagUrl,
      avatar: country.flagUrl,
      summary: plainTextOf(country.description),
      body: plainDocument(country.document),
      fields,
      tags: await tagNamesOf(country.tags),
      relations: relationTargets.map((relation) => relation.label),
      relationTargets,
      gallery: [],
    }
  }

  const categoryNames = new Set(
    categories
      .filter(
        (category) =>
          category.template === template.id ||
          category.template === template.name ||
          category.id === template.id,
      )
      .map((category) => category.name),
  )

  const entries = recentFirst(
    await db.worldEntries.filter((row) => !row.deleted && isCodexEntry(row)).toArray(),
  )
  const entry =
    entries.find(
      (row) =>
        row.template === template.id ||
        row.template === template.name ||
        categoryNames.has(row.category),
    ) ?? (template.id === 'entry' ? entries[0] : undefined)
  if (!entry) return null

  const body = plainTextOf(typeof worldBodyOf(entry) === 'string' ? (worldBodyOf(entry) as string) : JSON.stringify(worldBodyOf(entry)))
  const summary = (entry.summary ?? '').trim() || body.slice(0, 80)
  const declared = templateFieldKeys(template, groups)
  const types = templateFieldTypes(template, groups) ?? {}
  const groupId = template.components.find((component) => component.id === 'info')?.params?.group
  const group = typeof groupId === 'string' ? groups.find((item) => item.id === groupId) : undefined
  const fieldKeys = declared ?? Object.keys(entry.custom ?? {})
  const fields = fieldKeys.flatMap((key) => {
    // 特殊字段（时间 / 结束时间 / 地点）读词条自己的列，不读 custom
    const column = infoFieldColumnOf(types[key])
    const value = (column === undefined ? (entry.custom?.[key] ?? '') : (entry[column] ?? '')).trim()
    if (value === '') return []
    const label = group === undefined ? key : infoFieldLabelOf(group, key)
    return [[label, value] as [string, string]]
  })

  return {
    ...empty,
    subjectKind: 'world',
    subjectId: entry.id,
    title: entry.title || '未命名',
    cover: entry.cover,
    avatar: entry.avatar,
    image: entry.image,
    summary,
    fields,
    tags: await tagNamesOf(entry.tags),
    body,
    gallery: (entry.gallery ?? []).map((image) => image.caption || '图片'),
    galleryImages: (entry.gallery ?? []).map((image) => image.url),
    time: entry.time ?? '',
    location: entry.location ?? '',
  }
}

const PREVIEW_SAMPLE: Partial<Record<TemplateComponentId, string[]>> = {
  cover: ['（封面 / 头图）'],
  avatar: ['（头像）'],
  info: ['名称', '一句话'],
  relations: ['关系一行'],
  tags: ['标签'],
  image: ['图片'],
  gallery: ['画廊'],
  summary: ['简介'],
  body: ['正文……'],
}

/**
 * 编排里的一行：手柄 + 名称 +（开发中）+ 组件名 + 参数键 + 上移 / 下移 / 移除。
 *
 * 单独抽成组件是因为**拖拽要调 hook**（`useSortableItem`）：hook 不能写在
 * `enabled.map()` 的回调里（顺序会随列表长度变）。以前这一行只画了一枚
 * `GripVertical` 图标、根本没接 dnd —— 看着能拖，拖着没反应。
 */
function ComposerRow({
  component,
  wired,
  hasParams,
  groupName,
  paramsOpen,
  isFirst,
  isLast,
  onToggleParams,
  onEditComponent,
  onMove,
  onRemove,
}: {
  component: TemplateComponent
  wired: boolean
  hasParams: boolean
  groupName?: string
  paramsOpen: boolean
  isFirst: boolean
  isLast: boolean
  onToggleParams: () => void
  /** 没有参数可调、但有独立组件库时：跳去编辑那个组件（基本信息 / 正文） */
  onEditComponent?: () => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const { setNodeRef, style, attributes, listeners } = useSortableItem(component.id, false)
  const meta = COMPONENT_BY_ID[component.id]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border-b border-line py-2"
    >
      <DragHandle handleProps={{ attributes, listeners }} />
      <span className={`min-w-0 flex-1 truncate text-[13px] ${wired ? 'text-ink' : 'text-ink-faint'}`}>
        {meta?.label ?? component.id}
      </span>
      {!wired ? <span className="shrink-0 text-[11px] text-ink-faint">开发中</span> : null}
      {groupName ? <span className="shrink-0 text-[11px] text-ink-faint">{groupName}</span> : null}
      {hasParams ? (
        <button
          type="button"
          onClick={onToggleParams}
          aria-label="组件参数"
          aria-expanded={paramsOpen}
          className={`${ICON_BTN} ${paramsOpen ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
        >
          <SlidersHorizontal size={13} strokeWidth={2} />
        </button>
      ) : onEditComponent ? (
        <button
          type="button"
          onClick={onEditComponent}
          title="编辑这个组件"
          aria-label={`编辑${meta?.label ?? component.id}组件`}
          className={ICON_BTN}
        >
          <SlidersHorizontal size={13} strokeWidth={2} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={isFirst}
        className={`${ICON_BTN} disabled:opacity-30`}
        aria-label="上移"
      >
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={isLast}
        className={`${ICON_BTN} disabled:opacity-30`}
        aria-label="下移"
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className={`${ICON_BTN} hover:text-error`}
        aria-label={`移除「${meta?.label ?? component.id}」`}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export function TemplateComposer({
  initialId,
  onClose,
}: {
  initialId: string
  onClose: () => void
}) {
  const { templates } = useTemplates()
  const categories = useCategories()
  const infoGroups = useInfoGroups()
  const bodyGroups = useBodyGroups()
  const { navigateToEntity } = useEntityNavigate()
  const { closeSettings, openSettings } = useSettingsTrigger()
  const [activeId, setActiveId] = useState(initialId)
  const [paramsFor, setParamsFor] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null)
  const openExportCenter = useExportCenter()
  const active = templates.find((doc) => doc.id === activeId) ?? templates[0]

  // 右栏：有真实笔记就渲染真实内容；没有（实体模板 / 空库）才回落到结构示例
  useEffect(() => {
    let alive = true
    setPreviewData(null)
    void loadPreview(active, categories, infoGroups)
      .then((preview) => {
        if (alive) setPreviewData(preview)
      })
      .catch(() => {
        if (alive) setPreviewData(null)
      })
    return () => {
      alive = false
    }
  }, [active, categories, infoGroups])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (paramsFor !== null) {
        setParamsFor(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, paramsFor])

  if (!active) return null

  const enabled = active.components.filter((component) => component.enabled)
  /** 添加列表只给这个宿主真存得住的组件（实体模板没有的列不再出现） */
  const disabled = COMPONENT_IDS.filter(
    (id) =>
      isComponentAvailable(active.id, id) &&
      !active.components.some((component) => component.id === id && component.enabled),
  )

  const persist = (next: TemplateDoc): void => {
    void saveTemplate(next)
  }

  const move = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= enabled.length) return
    const next = enabled.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    persist({ ...active, components: [...next, ...active.components.filter((c) => !c.enabled)] })
  }

  /** 拖拽落位：与上下键走同一条写回路径（禁用组件始终保持在实际顺序之后） */
  const reorder = (activeId: string | number, overId: string | number): void => {
    const ids = enabled.map((component) => component.id)
    const nextIds = moveId(ids, String(activeId), String(overId))
    const byId = new Map(enabled.map((component) => [component.id, component]))
    const next = nextIds
      .map((id) => byId.get(id as TemplateComponentId))
      .filter((component): component is TemplateComponent => component !== undefined)
    if (next.length !== enabled.length) return
    persist({ ...active, components: [...next, ...active.components.filter((c) => !c.enabled)] })
  }

  const remove = (component: TemplateComponent): void => {
    persist({
      ...active,
      components: active.components.map((item) =>
        item.id === component.id ? { ...item, enabled: false } : item,
      ),
    })
  }

  const add = (id: TemplateComponentId): void => {
    const exists = active.components.some((component) => component.id === id)
    persist({
      ...active,
      components: exists
        ? active.components.map((component) => (component.id === id ? { ...component, enabled: true } : component))
        : [...active.components, { id, enabled: true }],
    })
  }

  const setParam = (componentId: TemplateComponentId, key: string, value: TemplateParamValue): void => {
    // 从 store 读当前值合并：连点两个参数不会用上一帧快照互相覆盖；
    // 选了组件顺手清掉旧的内联兼容键（`info.fields` / `body.preset`）。
    const patch = key === 'group' ? { group: value, fields: null, preset: null } : { [key]: value }
    void setTemplateComponentParams(active.id, componentId, patch).catch((err: unknown) => {
      toast.error('模板保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const paramComponent = paramsFor === null ? undefined : enabled.find((component) => component.id === paramsFor)
  const paramMeta = paramComponent ? COMPONENT_BY_ID[paramComponent.id] : undefined

  /** 预览里的关系跳到真实实体：先收编排层和设置，再导航 */
  const openRelation = (target: PreviewRelation): void => {
    if (target.id === undefined || target.type === undefined) return
    onClose()
    closeSettings()
    navigateToEntity(target.id, target.type)
  }

  /** 标签没有独立页面：从预览跳到设置里的标签管理 */
  const openTagManager = (): void => {
    onClose()
    openSettings('world', 'tags')
  }
  const previewImages =
    previewData === null
      ? []
      : [previewData.cover, previewData.avatar, previewData.image, ...previewData.galleryImages].filter(
          (url): url is string => typeof url === 'string' && url !== '',
        )

  const content = (
    <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-paper pt-[var(--oc-titlebar-h)]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <button type="button" onClick={onClose} className={`${ICON_BTN} w-auto gap-1 px-1.5`} aria-label="返回">
          <ArrowLeft size={16} strokeWidth={2} />
          <span className="text-[13px] max-md:hidden">返回</span>
        </button>
        <span className="min-w-0 truncate font-serif text-[15px] font-bold text-ink">{active.name}</span>
        <span className="shrink-0 text-[11px] text-ink-faint max-md:hidden">编排</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => { if (previewData !== null) openExportCenter({ tab: 'poster', subject: { kind: previewData.subjectKind, id: previewData.subjectId } }) }}
            disabled={previewData === null}
            aria-label="导出图片"
            className={`${BTN_QUIET} gap-1 ${previewData === null ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            <span className="max-md:hidden">导出图片</span>
          </button>
          <button type="button" onClick={onClose} className={BTN_PRIMARY}>
            完成
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左：模板列表 */}
        <aside className="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-line py-2 max-md:hidden">
          {templates.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => {
                setActiveId(doc.id)
                setParamsFor(null)
              }}
              className={`${MENU_ITEM} ${doc.id === active.id ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
            >
              {doc.name}
            </button>
          ))}
        </aside>

        {/* 中：编排 */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-4 max-md:px-4">
          <SortableList
            ids={enabled.map((component) => component.id)}
            onReorder={reorder}
            layout="list"
          >
            <div className="flex flex-col">
              {enabled.map((component, index) => {
                const wired = isComponentWired(active.id, component.id)
                const paramDefs = templateParamsFor(active.id, component.id, active)
                const hasParams = wired && paramDefs.length > 0
                const groupId = typeof component.params?.group === 'string' ? component.params.group : ''
                const groupName =
                  component.id === 'info'
                    ? infoGroups.find((group) => group.id === groupId)?.name
                    : component.id === 'body'
                      ? bodyGroups.find((group) => group.id === bodyGroupIdOfTemplate(active.id))?.name
                      : undefined
                return (
                  <ComposerRow
                    key={component.id}
                    component={component}
                    wired={wired}
                    hasParams={hasParams}
                    groupName={groupName}
                    paramsOpen={paramsFor === component.id}
                    isFirst={index === 0}
                    isLast={index === enabled.length - 1}
                    onToggleParams={() =>
                      setParamsFor((prev) => (prev === component.id ? null : component.id))
                    }
                    onEditComponent={(() => {
                      // 角色 / 事件 / 国家的「基本信息」没有可调参数，但字段表要能跳过去
                      const target = componentEditTarget(active.id, component.id)
                      if (!target) return undefined
                      return () => {
                        onClose()
                        openSettings('world', 'components', target.target)
                      }
                    })()}
                    onMove={(delta) => move(index, delta)}
                    onRemove={() => remove(component)}
                  />
                )
              })}
            </div>
          </SortableList>

          {disabled.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {disabled.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => add(id)}
                  className={`${BTN_QUIET} h-7 px-2 text-[12px]`}
                >
                  <Plus size={12} strokeWidth={2} />
                  {COMPONENT_BY_ID[id]?.label ?? id}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {/* 右：真实数据预览（空库回落到结构示例） */}
        <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-line px-5 py-4 max-md:hidden">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-faint">预览</span>
            {previewData ? (
              <span className="text-[11px] text-ink-faint">真实数据</span>
            ) : (
              <span className="text-[11px] text-ink-faint">结构示例</span>
            )}
          </div>
          <div className={`flex flex-col gap-6 p-5 ${PANEL}`}>
            {enabled.length === 0 ? (
              <p className="text-[12px] text-ink-faint">还没有组件</p>
            ) : (
              enabled.map((component, index) => {
                const meta = COMPONENT_BY_ID[component.id]
                const fields = component.id === 'info' ? templateFieldKeys(active, infoGroups) : undefined
                const lines =
                  fields !== undefined && fields.length > 0
                    ? fields
                    : (PREVIEW_SAMPLE[component.id] ?? [])
                const previous = enabled[index - 1]?.id
                // 与真实渲染（`TemplateRenderer`）同一条规则：封面 / 头像之后不画线，
                // 紧跟头像的那块再收紧一点 —— 以前预览比实际界面多一条线、间距也松。
                const divider = index > 0 && previous !== 'cover' && previous !== 'avatar'
                const snuggle = previous === 'avatar' ? '-mt-3' : ''

                let body: ReactNode
                if (previewData !== null) {
                  switch (component.id) {
                    case 'cover':
                      body = previewData.cover ? (
                        <button
                          type="button"
                          onClick={() => setViewer({ images: previewImages, index: 0 })}
                          className="block w-full"
                          aria-label="查看封面大图"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader */}
                          <img
                            src={resolveImageUrl(previewData.cover, 'cover')}
                            alt=""
                            className="aspect-[3/2] w-full cursor-zoom-in rounded-item object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex aspect-[3/2] items-center justify-center rounded-item bg-paper-alt text-[11px] text-ink-faint">
                          封面
                        </div>
                      )
                      break
                    case 'avatar':
                      body = previewData.avatar ? (
                        <button
                          type="button"
                          onClick={() => setViewer({ images: previewImages, index: previewImages.indexOf(previewData.avatar ?? '') })}
                          className="block"
                          aria-label="查看头像大图"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader */}
                          <img
                            src={resolveImageUrl(previewData.avatar, 'avatar')}
                            alt=""
                            className="h-16 w-16 cursor-zoom-in rounded-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-paper-alt" />
                      )
                      break
                    case 'image':
                      body = previewData.image ? (
                        <button
                          type="button"
                          onClick={() =>
                            setViewer({
                              images: previewImages,
                              index: previewImages.indexOf(previewData.image ?? ''),
                            })
                          }
                          className="block w-full"
                          aria-label="查看图片大图"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader */}
                          <img
                            src={resolveImageUrl(previewData.image, 'gallery')}
                            alt=""
                            className="aspect-[3/2] w-full cursor-zoom-in rounded-item object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex aspect-[3/2] items-center justify-center rounded-item bg-paper-alt text-[11px] text-ink-faint">
                          图片
                        </div>
                      )
                      break
                    case 'info':
                      body = (
                        <div className="flex flex-col gap-2">
                          <p className="font-serif text-[17px] font-bold text-ink">{previewData.title}</p>
                          {previewData.fields.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {previewData.fields.map(([label, value]) => (
                                <div key={label} className="flex gap-2 text-[12px]">
                                  <span className="w-14 shrink-0 text-ink-faint">{label}</span>
                                  <span className="min-w-0 text-ink-muted">{value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                      break
                    case 'tags':
                      body =
                        previewData.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {previewData.tags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={openTagManager}
                                className={`${CHIP} transition-colors hover:bg-[var(--oc-hover)] hover:text-ink`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-ink-faint">标签</p>
                        )
                      break
                    case 'summary':
                      body = (
                        <p className="text-[12px] leading-6 text-ink-muted">
                          {previewData.summary || '简介'}
                        </p>
                      )
                      break
                    case 'body':
                      body = (
                        <p className="max-h-36 overflow-hidden whitespace-pre-line text-[12px] leading-6 text-ink-muted">
                          {previewData.body || '正文'}
                        </p>
                      )
                      break
                    case 'relations':
                      body =
                        previewData.relationTargets.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {previewData.relationTargets.slice(0, 4).map((relation, relationIndex) => (
                              <button
                                key={`${relation.label}-${relationIndex}`}
                                type="button"
                                onClick={() => openRelation(relation)}
                                className="truncate rounded-item px-1 py-0.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                              >
                                {relation.label}
                              </button>
                            ))}
                          </div>
                        ) : previewData.relations.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {previewData.relations.slice(0, 4).map((relation) => (
                              <p key={relation} className="text-[12px] text-ink-muted">
                                {relation}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {lines.map((line) => (
                              <p key={line} className="text-[12px] text-ink-faint">
                                {line}
                              </p>
                            ))}
                          </div>
                        )
                      break
                    case 'gallery':
                      body =
                        previewData.galleryImages.length > 0 ? (
                          <div className="grid grid-cols-4 gap-1">
                            {previewData.galleryImages.slice(0, 4).map((url, imageIndex) => (
                              <button
                                key={`${url}-${imageIndex}`}
                                type="button"
                                onClick={() =>
                                  setViewer({
                                    images: previewImages,
                                    index: previewImages.indexOf(url),
                                  })
                                }
                                aria-label="查看画廊大图"
                                className="block"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- 库内相对路径，静态导出没有 next/image loader */}
                                <img
                                  src={resolveImageUrl(url, 'gallery')}
                                  alt=""
                                  className="aspect-square w-full cursor-zoom-in rounded-item object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        ) : previewData.gallery.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {previewData.gallery.slice(0, 4).map((caption, imageIndex) => (
                              <p key={`${caption}-${imageIndex}`} className="text-[12px] text-ink-muted">
                                {caption}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {lines.map((line) => (
                              <p key={line} className="text-[12px] text-ink-faint">
                                {line}
                              </p>
                            ))}
                          </div>
                        )
                      break
                    case 'portrait':
                      body = (
                        <div className="grid grid-cols-4 gap-1">
                          {[0, 1, 2, 3].map((slot) => (
                            <div
                              key={slot}
                              className="aspect-[9/16] w-full rounded-item bg-paper-card"
                            />
                          ))}
                        </div>
                      )
                      break
                    case 'animation':
                      body = (
                        <p className="text-[12px] text-ink-muted">动画视频</p>
                      )
                      break
                    default:
                      body = (
                        <div className="flex flex-col gap-1">
                          {lines.map((line) => (
                            <p key={line} className="text-[12px] text-ink-faint">
                              {line}
                            </p>
                          ))}
                        </div>
                      )
                  }
                } else {
                  body = (
                    <div className="flex flex-col gap-1">
                      {lines.map((line) => (
                        <p key={line} className="text-[12px] text-ink-faint">
                          {line}
                        </p>
                      ))}
                    </div>
                  )
                }

                return (
                  <ComponentSection
                    key={component.id}
                    divider={divider}
                    className={snuggle}
                    title={component.id === 'cover' || component.id === 'body' ? undefined : meta?.label}
                  >
                    {body}
                  </ComponentSection>
                )
              })
            )}
          </div>
        </aside>
      </div>

      {paramComponent ? (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            aria-label="关闭参数"
            onClick={() => setParamsFor(null)}
            className="absolute inset-0 bg-[var(--oc-scrim)]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${paramMeta?.label ?? paramComponent.id}参数`}
            className="relative flex h-full w-[360px] max-w-full flex-col border-l border-line bg-paper/85 backdrop-blur-lg float-shadow"
          >
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
              <span className={SECTION_TITLE_BARE}>{paramMeta?.label ?? paramComponent.id}</span>
              <span className="text-[11px] text-ink-faint">参数</span>
              <button
                type="button"
                onClick={() => setParamsFor(null)}
                aria-label="关闭参数"
                className={`${ICON_BTN} ml-auto`}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <TemplateComponentParams
                doc={active}
                component={paramComponent}
                onChange={(key, value) => setParam(paramComponent.id, key, value)}
              />
            </div>

            <footer className="shrink-0 border-t border-line p-3">
              <button type="button" onClick={() => setParamsFor(null)} className={`${BTN_PRIMARY} w-full`}>
                完成
              </button>
            </footer>
          </aside>
        </div>
      ) : null}


      {viewer ? (
        <FullscreenViewer
          images={viewer.images}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}

