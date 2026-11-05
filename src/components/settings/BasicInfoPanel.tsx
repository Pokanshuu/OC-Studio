'use client'

/**
 * 设置 › 世界 › 组件 › 基本信息 —— **两级**：先选「基本信息模板」，点进去才是字段表。
 *
 * 为什么拆两级：基本信息不是一个全局表，而是**每个模板各一份**。以前把
 * 角色 / 事件 / 词条的表竖着堆在一屏里，用户看到的是「一长串行」，看不出
 * 它们其实属于不同的模板，也没法给宠物 / 武器这类新模板留位置。
 *
 * 两类行，配置源不同（这是本文件最重要的一条）：
 * - **实体字段表**（角色 / 词条）：`lib/fields`，值走实体列或 `custom`，
 *   读写 `.ocstudio/fields.json`。
 * - **模板字段**（宠物 / 武器 / 自建）：模板的 `info.params.fields`，
 *   值落 `WorldEntry.custom`，随模板文件走（`lib/templates/fields.ts`）。
 *
 * 两种都存在是有原因的：实体有自己的强类型列（种族 / 阵营…），而笔记类模板
 * 没有列，只能靠键。合并会丢内置字段的语义，所以这里显式分流。
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { FieldKindSettings } from '@/components/settings/FieldSettings'
import { DragHandle, SortableList, moveId, useSortableItem } from '@/components/shared/list-dnd'
import type { FieldKind } from '@/lib/fields'
import { templateFieldKeys } from '@/lib/templates/fields'
import { isNoteTemplate } from '@/lib/templates/note'
import { saveTemplate, saveTemplates, useTemplates } from '@/lib/templates/store'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'
import { BTN_QUIET, ICON_BTN, INPUT_LINE, ROUND_ITEM } from '@/lib/ui-tokens'

type Row =
  | { type: 'field'; key: string; label: string; fieldKind: FieldKind; ready: boolean }
  | { type: 'template'; key: string; label: string; templateId: string; ready: boolean }

/**
 * 四类内置实体，字段表是**实体列**驱动的那一类。
 *
 * `ready: false` 的项不是「忘了做」，是那张表确实还没接到渲染器上
 * （事件 / 国家目前没有字段行可增删，见 `lib/fields/types.ts` 顶部注释）。
 * 界面上标「开发中」并置灰，比让用户改完发现没反应好。
 */
const FIELD_ROWS: Row[] = [
  { type: 'field', key: 'character', label: '角色', fieldKind: 'character', ready: true },
  { type: 'field', key: 'event', label: '事件', fieldKind: 'event', ready: false },
  { type: 'field', key: 'worldEntry', label: '词条', fieldKind: 'worldEntry', ready: true },
]

/** 自建模板 id：稳定、可读、不会与内置冲突 */
function customId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** 新模板 = 笔记类的五块（封面 / 基本信息 / 标签 / 简介 / 正文），字段表先空着 */
function blankNoteTemplate(taken: string[]): TemplateDoc {
  const names = new Set(taken)
  let name = '新模板'
  let counter = 2
  while (names.has(name)) {
    name = `新模板 ${counter}`
    counter += 1
  }
  const components: TemplateComponent[] = (['cover', 'info', 'tags', 'summary', 'body'] as const).map((id) => ({
    id,
    enabled: true,
    ...(id === 'info' ? { params: { fields: [] as string[] } } : {}),
  }))
  return { id: customId(), name, aliases: [], components }
}

/** 把字段表写回模板的 info 组件（只动这一格，别的组件参数原样保留） */
function withInfoFields(doc: TemplateDoc, fields: string[]): TemplateDoc {
  return {
    ...doc,
    components: doc.components.map((component) =>
      component.id === 'info'
        ? { ...component, params: { ...(component.params ?? {}), fields } }
        : component,
    ),
  }
}

/** 一行字段：手柄 + 键名（可直接改）+ 删除。样式与「模板 › 组件行」同一套 */
function FieldKeyRow({
  fieldKey,
  onRename,
  onRemove,
}: {
  fieldKey: string
  onRename: (next: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(fieldKey)
  const { setNodeRef, style, attributes, listeners } = useSortableItem(fieldKey, false)

  const commit = (): void => {
    const next = draft.trim()
    if (next === '' || next === fieldKey) {
      setDraft(fieldKey)
      return
    }
    onRename(next)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 border-b border-line py-1 last:border-b-0"
    >
      <DragHandle handleProps={{ attributes, listeners }} />
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(fieldKey)
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`删除字段「${fieldKey}」`}
        className={`${ICON_BTN} hover:text-error`}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

/** 模板的字段表：键 = frontmatter 同名键，值落 `WorldEntry.custom` */
function TemplateFieldsSettings({ doc }: { doc: TemplateDoc }) {
  const declared = templateFieldKeys(doc)
  const keys = useMemo(() => declared ?? [], [declared])
  const [draftName, setDraftName] = useState('')

  const commit = (next: string[]): void => {
    void saveTemplate(withInfoFields(doc, next)).catch((err: unknown) => {
      toast.error('字段保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  const reorder = (activeKey: number | string, overKey: number | string): void => {
    const next = moveId(keys, String(activeKey), String(overKey))
    commit(next)
  }

  const rename = (index: number, next: string): void => {
    // 键就是 frontmatter 的键：改名只影响之后的写入，已存的旧键值不搬（不猜用户意图）
    if (keys.includes(next)) {
      toast.error(`已经有「${next}」了`)
      return
    }
    commit(keys.map((key, i) => (i === index ? next : key)))
  }

  const add = (): void => {
    const key = draftName.trim()
    if (key === '') return
    if (keys.includes(key)) {
      toast.error(`已经有「${key}」了`)
      return
    }
    commit([...keys, key])
    setDraftName('')
  }

  return (
    <section className="flex flex-col gap-2">
      {declared === undefined ? (
        <p className="text-[11px] text-ink-faint">未声明时沿用词条字段表</p>
      ) : null}

      <SortableList ids={keys} onReorder={reorder} layout="list">
        <div className="flex flex-col">
          {keys.map((key, index) => (
            <FieldKeyRow
              key={key}
              fieldKey={key}
              onRename={(next) => rename(index, next)}
              onRemove={() => commit(keys.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      </SortableList>

      {keys.length === 0 ? <p className="py-2 text-[12px] text-ink-faint">还没有字段</p> : null}

      <div className="flex items-center gap-2">
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
          placeholder="新字段名"
          className="h-7 min-w-0 flex-1 border-b border-line bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={draftName.trim() === ''}
          className={`flex h-7 shrink-0 items-center gap-1 px-2 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40 ${ROUND_ITEM}`}
        >
          <Plus size={13} strokeWidth={2} />
          <span>添加</span>
        </button>
      </div>
    </section>
  )
}

export function BasicInfoPanel({ onBack }: { onBack: () => void }) {
  const { templates } = useTemplates()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const rows = useMemo<Row[]>(() => {
    const templateRows: Row[] = templates
      .filter((doc) => isNoteTemplate(doc) && doc.components.some((component) => component.id === 'info' && component.enabled))
      .map((doc) => ({ type: 'template', key: doc.id, label: doc.name, templateId: doc.id, ready: true }))
    return [...FIELD_ROWS, ...templateRows]
  }, [templates])

  const active = rows.find((row) => row.key === activeKey) ?? null
  const activeTemplate =
    active && active.type === 'template' ? templates.find((doc) => doc.id === active.templateId) ?? null : null

  const createTemplate = (): void => {
    const doc = blankNoteTemplate(templates.map((item) => item.name))
    void saveTemplates([...templates, doc])
      .then(() => setActiveKey(doc.id))
      .catch((err: unknown) => toast.error('新建失败', { description: String(err) }))
  }

  if (!active) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 pb-1">
          <button type="button" onClick={onBack} aria-label="返回" className={ICON_BTN}>
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-sm text-ink">基本信息</span>
        </div>

        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            disabled={!row.ready}
            onClick={() => setActiveKey(row.key)}
            className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            <span>{row.label}</span>
            {row.ready ? (
              <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
            ) : (
              <span className="text-[11px] text-ink-faint">开发中</span>
            )}
          </button>
        ))}

        <button type="button" onClick={createTemplate} className={`${BTN_QUIET} mt-3 self-start`}>
          <Plus size={13} strokeWidth={2} />
          新建模板
        </button>
        <p className="mt-1 text-[11px] text-ink-faint">新模板在分类里绑</p>
      </div>
    )
  }

  const commitRename = (): void => {
    setRenaming(false)
    if (!activeTemplate) return
    const next = nameDraft.trim()
    const from = activeTemplate.name
    if (next === '' || next === from) return
    // 改名不回写笔记：旧名进别名（与「模板」面板同一套，docs/模板.md §3.5）
    const aliases = activeTemplate.aliases.includes(from)
      ? activeTemplate.aliases
      : [...activeTemplate.aliases, from]
    void saveTemplate({ ...activeTemplate, name: next, aliases }).catch((err: unknown) => {
      toast.error('改名失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setActiveKey(null)} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        {active.type === 'template' ? (
          renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') setRenaming(false)
              }}
              className={`${INPUT_LINE} max-w-[200px]`}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setRenaming(true)
                setNameDraft(active.label)
              }}
              title="重命名"
              className="text-sm font-medium text-ink transition-colors hover:text-ink-muted"
            >
              {activeTemplate?.name ?? active.label}
            </button>
          )
        ) : (
          <span className="text-sm font-medium text-ink">{active.label}</span>
        )}
      </div>

      {active.type === 'field' ? (
        <FieldKindSettings kind={active.fieldKind} />
      ) : activeTemplate ? (
        <TemplateFieldsSettings doc={activeTemplate} />
      ) : null}
    </div>
  )
}
