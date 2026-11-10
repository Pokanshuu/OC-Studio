'use client'

/**
 * 设置 › 世界 › 模板。
 *
 * 做四件事：**排列组件、启用 / 移除组件、增删改模板、恢复默认**。
 * 改动即时写模板文件（没有保存按钮）。
 *
 * 行的形态**跟「自定义组件 › 基本信息」的字段表同一套**（`FieldSettings`）：
 * 左侧拖拽手柄排序、行高 `py-1`、13px 字、右侧一个 `×` —— 两处都是
 * 「一条一条的东西」，不该长成两种样子。
 *
 * 完整的全宽编排层（左列表 / 中编排 / 右实时预览 + 参数抽屉）见 `docs/模板.md §8`，
 * 等参数真正被消费后再做；现在这个列表是「先把契约跑通」的最小界面。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Copy, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { TemplateComposer } from '@/components/shared/TemplateComposer'
import { TemplateComponentParams } from '@/components/shared/TemplateParams'
import { DragHandle, SortableList, moveId, useSortableItem } from '@/components/shared/list-dnd'
import { COMPONENT_BY_ID, COMPONENT_IDS } from '@/lib/templates/registry'
import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { isComponentAvailable, isComponentWired } from '@/lib/templates/support'
import { templateParamsFor, type TemplateParamValue } from '@/lib/templates/params'
import { componentEditTarget } from '@/lib/templates/edit-target'
import { blankTemplateDoc, customTemplateId } from '@/lib/templates/defaults'
import { useInfoGroups } from '@/lib/templates/info-groups'
import { useBodyGroups } from '@/lib/templates/body-groups'
import { bodyGroupIdOfTemplate } from '@/lib/templates/body-preset'
import {
  resetTemplateToBuiltin,
  saveTemplate,
  saveTemplates,
  setTemplateComponentParams,
  useTemplates,
} from '@/lib/templates/store'
import type { TemplateComponent, TemplateComponentId, TemplateDoc } from '@/lib/templates/types'
import { BTN_DANGER, BTN_QUIET, ICON_BTN, INPUT_LINE, ROUND_ITEM, SETTINGS_EMPTY } from '@/lib/ui-tokens'
import { SettingsEntryRow } from './EntryRow'
function isBuiltin(id: string): boolean {
  return BUILTIN_TEMPLATES.some((doc) => doc.id === id)
}

/** 一行组件：手柄 + 名称 +（开发中）+ 已选组件名 + 设置 + 移除 */
function ComponentRow({
  component,
  wired,
  detail,
  hasParams,
  expanded,
  onToggleSettings,
  onEditComponent,
  onRemove,
  children,
}: {
  component: TemplateComponent
  wired: boolean
  /** 基本信息行显示选中的基本信息组件名（与模板名无关） */
  detail?: string
  hasParams: boolean
  expanded: boolean
  onToggleSettings: () => void
  /** 没有参数可调、但有独立的组件库时：跳去编辑那个组件（基本信息 / 正文） */
  onEditComponent?: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  const { setNodeRef, style, attributes, listeners } = useSortableItem(component.id, false)
  const meta = COMPONENT_BY_ID[component.id]

  return (
    <div ref={setNodeRef} style={style} className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-1 py-1">
        <DragHandle handleProps={{ attributes, listeners }} />
        <span className={`min-w-0 flex-1 truncate text-[13px] ${wired ? 'text-ink' : 'text-ink-faint'}`}>
          {meta?.label ?? component.id}
        </span>
        {!wired ? <span className="shrink-0 text-[11px] text-ink-faint">开发中</span> : null}
        {detail ? <span className="shrink-0 text-[11px] text-ink-faint">{detail}</span> : null}
        {hasParams ? (
          <button
            type="button"
            onClick={onToggleSettings}
            title="组件设置"
            aria-label={`${meta?.label ?? component.id}设置`}
            aria-expanded={expanded}
            className={`${ICON_BTN} ${expanded ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
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
          onClick={onRemove}
          aria-label={`从模板里移除「${meta?.label ?? component.id}」`}
          className={`${ICON_BTN} hover:text-error disabled:opacity-30`}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      {children}
    </div>
  )
}

export function TemplatesPanel({
  initialId,
  onEditComponent,
}: {
  initialId?: string
  /** 行上那枚设置键：父级（WorldTab）自己换页，不走 `openSettings` 重挂整棵树 */
  onEditComponent?: (target: string) => void
}) {
  const { templates, loading } = useTemplates()
  const infoGroups = useInfoGroups()
  const bodyGroups = useBodyGroups()
  const [activeId, setActiveId] = useState<string | null>(initialId ?? null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [deleting, setDeleting] = useState<TemplateDoc | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [paramsFor, setParamsFor] = useState<TemplateComponentId | null>(null)
  const active = useMemo(() => templates.find((doc) => doc.id === activeId) ?? null, [templates, activeId])

  const persist = async (next: TemplateDoc): Promise<void> => {
    try {
      await saveTemplate(next)
    } catch (err) {
      toast.error('模板保存失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  if (loading && templates.length === 0) {
    return <p className="py-6 text-[13px] text-ink-faint">加载中…</p>
  }

  if (!active) {
    return (
      <div className="flex flex-col">
        <div className="flex flex-col">
          {templates.map((doc) => (
            <SettingsEntryRow
              key={doc.id}
              label={doc.name}
              meta={`${doc.components.filter((component) => component.enabled).length} 个组件`}
              onClick={() => {
                setActiveId(doc.id)
                setParamsFor(null)
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const doc = blankTemplateDoc(templates.map((item) => item.name))
            void saveTemplates([...templates, doc])
              .then(() => setActiveId(doc.id))
              .catch((err: unknown) => toast.error('新建失败', { description: String(err) }))
          }}
          className={`${BTN_QUIET} mt-3 self-start`}
        >
          <Plus size={13} strokeWidth={2} />
          新建模板
        </button>
      </div>
    )
  }

  const enabled: TemplateComponent[] = active.components.filter((component) => component.enabled)
  /** 添加列表只给这个宿主真存得住的组件；已存在的历史组件仍按行显示，可手动移除 */
  const disabled = COMPONENT_IDS.filter(
    (id) =>
      isComponentAvailable(active.id, id) &&
      !active.components.some((component) => component.id === id && component.enabled),
  )

  /** 拖拽排序：只换位置，其余字段不动 */
  const reorder = (activeKey: number | string, overKey: number | string): void => {
    const ids = moveId(enabled.map((component) => component.id), String(activeKey), String(overKey))
    const byId = new Map(enabled.map((component) => [component.id, component]))
    const next = ids.map((id) => byId.get(id as TemplateComponentId)).filter((item): item is TemplateComponent => Boolean(item))
    const rest = active.components.filter((component) => !component.enabled)
    void persist({ ...active, components: [...next, ...rest] })
  }

  const remove = (component: TemplateComponent): void => {
    void persist({
      ...active,
      components: active.components.map((item) =>
        item.id === component.id ? { ...item, enabled: false } : item,
      ),
    })
  }

  const add = (id: TemplateComponentId): void => {
    const exists = active.components.some((component) => component.id === id)
    const next = exists
      ? active.components.map((component) => (component.id === id ? { ...component, enabled: true } : component))
      : [...active.components, { id, enabled: true }]
    void persist({ ...active, components: next })
  }

  const setParam = (componentId: TemplateComponentId, key: string, value: TemplateParamValue): void => {
    // 从 store 读当前值再写：连点不会用上一帧的快照互相覆盖。
    // 选了组件就清掉旧的内联兼容键（基本信息 `fields` / 正文 `preset`）。
    const patch = key === 'group' ? { group: value, fields: null, preset: null } : { [key]: value }
    void setTemplateComponentParams(active.id, componentId, patch).catch((err: unknown) => {
      toast.error('模板保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  const commitRename = (): void => {
    const next = nameDraft.trim()
    const from = active.name
    setRenaming(null)
    if (next === '' || next === from) return
    // 改名不回写笔记：旧名进别名，读取时按名 + 别名匹配（`模板.md §3.5`）
    const aliases = active.aliases.includes(from) ? active.aliases : [...active.aliases, from]
    void persist({ ...active, name: next, aliases })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setActiveId(null); setParamsFor(null) }} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        {renaming === active.id ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') setRenaming(null)
            }}
            className={`${INPUT_LINE} max-w-[200px]`}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setRenaming(active.id)
              setNameDraft(active.name)
            }}
            className="text-sm font-medium text-ink transition-colors hover:text-ink-muted"
            title="重命名"
          >
            {active.name}
          </button>
        )}
      </div>

      <SortableList ids={enabled.map((component) => component.id)} onReorder={reorder} layout="list">
        <div className="flex flex-col">
          {enabled.map((component) => {
            const wired = isComponentWired(active.id, component.id)
            const hasParams = wired && templateParamsFor(active.id, component.id, active).length > 0
            const expanded = paramsFor === component.id
            const groupId = typeof component.params?.group === 'string' ? component.params.group : ''
            const bodyGroupId = component.id === 'body' ? bodyGroupIdOfTemplate(active.id) : ''
            const detail =
              component.id === 'info' && hasParams
                ? infoGroups.find((group) => group.id === groupId)?.name ??
                  (component.params?.fields !== undefined ? '内联字段' : '未选择')
                : component.id === 'body'
                  ? bodyGroups.find((group) => group.id === bodyGroupId)?.name
                  : undefined
            return (
              <ComponentRow
                key={component.id}
                component={component}
                wired={wired}
                detail={detail}
                hasParams={hasParams}
                expanded={expanded}
                onToggleSettings={() =>
                  setParamsFor((prev) => (prev === component.id ? null : component.id))
                }
                onEditComponent={(() => {
                  // 角色 / 事件 / 国家的「基本信息」没有模板参数可调（字段表是全局真源），
                  // 但那一行仍然需要一个入口 —— 不然从模板里根本跳不到字段表
                  const target = componentEditTarget(active.id, component.id)
                  if (!target) return undefined
                  return () => onEditComponent?.(target.target)
                })()}
                onRemove={() => remove(component)}
              >
                {expanded ? (
                  <div className="border-t border-line [&>*:last-child]:border-b-0">
                    <TemplateComponentParams
                      doc={active}
                      component={component}
                      onChange={(key, value) => setParam(component.id, key, value)}
                    />
                  </div>
                ) : null}
              </ComponentRow>
            )
          })}
        </div>
      </SortableList>

      {enabled.length === 0 ? <p className={SETTINGS_EMPTY}>还没有组件</p> : null}

      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAddMenu({ x: rect.left, y: rect.bottom + 4 })
        }}
        disabled={disabled.length === 0}
        className={`flex h-7 shrink-0 items-center gap-1 self-start px-2 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40 ${ROUND_ITEM}`}
      >
        <Plus size={13} strokeWidth={2} />
        <span>添加组件</span>
      </button>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => setComposerOpen(true)} className={BTN_QUIET}>
          编排
        </button>
        <button
          type="button"
          onClick={() => {
            const copy: TemplateDoc = {
              ...active,
              id: customTemplateId(),
              name: `${active.name} 副本`,
              aliases: [],
              components: active.components.map((component) => ({ ...component })),
            }
            void saveTemplates([...templates, copy])
              .then(() => {
                setActiveId(copy.id)
                toast.success(`已复制为「${copy.name}」`)
              })
              .catch((err: unknown) => toast.error('复制失败', { description: String(err) }))
          }}
          className={BTN_QUIET}
        >
          <Copy size={13} strokeWidth={2} />
          复制
        </button>

        {isBuiltin(active.id) ? (
          <button
            type="button"
            onClick={() => {
              const builtin = resetTemplateToBuiltin(active.id)
              if (!builtin) return
              void persist(builtin)
              toast.success(`「${builtin.name}」已恢复默认`)
            }}
            className={BTN_QUIET}
          >
            <RotateCcw size={13} strokeWidth={2} />
            恢复默认
          </button>
        ) : (
          <button type="button" onClick={() => setDeleting(active)} className={BTN_QUIET}>
            <Trash2 size={13} strokeWidth={2} />
            删除
          </button>
        )}
      </div>

      {/* 数据口径：改动落在库里的文件，不进应用设置 */}
      <p className="text-[11px] text-ink-faint">改动即时写入 .ocstudio/templates/</p>

      {composerOpen ? (
        <TemplateComposer initialId={active.id} onClose={() => setComposerOpen(false)} />
      ) : null}

      {addMenu ? (
        <MediaContextMenu
          at={addMenu}
          onClose={() => setAddMenu(null)}
          items={disabled.map((id) => ({
            label: COMPONENT_BY_ID[id]?.label ?? id,
            onSelect: () => add(id),
          }))}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板「{deleting?.name}」</AlertDialogTitle>
            <AlertDialogDescription>
              笔记本身不会被修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={BTN_DANGER}
              onClick={() => {
                const target = deleting
                setDeleting(null)
                if (!target) return
                void saveTemplates(templates.filter((doc) => doc.id !== target.id))
                  .then(() => {
                    setActiveId(null)
                    toast.success(`已删除「${target.name}」`)
                  })
                  .catch((err: unknown) => toast.error('删除失败', { description: String(err) }))
              }}
            >
              删除模板
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
