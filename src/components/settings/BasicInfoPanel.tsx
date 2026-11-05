'use client'

/**
 * 设置 › 世界 › 自定义组件 › 基本信息。
 *
 * 两类东西，**关系不同**：
 * - **字段表**（角色 / 词条）：实体自己的全局字段表（`lib/fields`），
 *   实体模板直接消费，不存在「选择」。
 * - **基本信息组件**（宠物 / 武器 / 自建）：独立的、可复用的字段组；
 *   模板只是**选择**其中一个（`info.params.group = <id>`）。名字和模板名无关，
 *   改组件名不会影响模板，改模板名也不会影响组件 —— 关系只由选择决定。
 *
 * 这里管理组件库：新建 / 改名 / 增删字段 / 删除（内置不可删）。
 * 模板侧的选择器在 `TemplateParams`，两边共用同一份 `useInfoGroups()`。
 */
import { useState } from 'react'
import { ArrowLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { FieldKindSettings } from '@/components/settings/FieldSettings'
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
import { DragHandle, SortableList, moveId, useSortableItem } from '@/components/shared/list-dnd'
import type { FieldKind } from '@/lib/fields'
import type { InfoGroupHost } from '@/lib/templates/info-groups'
import { SettingsFieldRow } from './FieldRow'
import {
  createInfoGroup,
  deleteInfoGroup,
  isBuiltinInfoGroup,
  updateInfoGroup,
  useInfoGroups,
  type InfoGroup,
} from '@/lib/templates/info-groups'
import { useTemplates } from '@/lib/templates/store'
import { BTN_DANGER, BTN_QUIET, ICON_BTN, INPUT_LINE, ROUND_ITEM } from '@/lib/ui-tokens'

/**
 * 实体字段表（`ready: false` = 那张表还没接到渲染器上，见 `lib/fields/types.ts`）。
 * 这些不是「基本信息组件」，不能被模板选择；它们是实体模板的固定字段表。
 */
const FIELD_ROWS: { key: string; label: string; fieldKind: FieldKind; ready: boolean }[] = [
  { key: 'character', label: '角色', fieldKind: 'character', ready: true },
  { key: 'event', label: '事件', fieldKind: 'event', ready: false },
  { key: 'worldEntry', label: '词条', fieldKind: 'worldEntry', ready: true },
]

/** 宿主 → 字段表种类。列型宿主（角色 / 事件 / 词条）共用同一套字段表编辑器 */
function columnKindOf(host: InfoGroupHost | undefined): FieldKind | undefined {
  if (host === 'character') return 'character'
  if (host === 'event') return 'event'
  if (host === 'world') return 'worldEntry'
  return undefined
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

/** 一个基本信息组件的字段表（键 = frontmatter 同名键，值落 WorldEntry.custom） */
function GroupFieldsSettings({ group }: { group: InfoGroup }) {
  const keys = group.fields
  const [draftName, setDraftName] = useState('')

  const commit = (next: string[]): void => {
    void updateInfoGroup(group.id, { fields: next }).catch((err: unknown) => {
      toast.error('字段保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  const reorder = (activeKey: number | string, overKey: number | string): void => {
    commit(moveId(keys, String(activeKey), String(overKey)))
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
      <SortableList ids={keys} onReorder={reorder} layout="list">
        <div className="flex flex-col">
          {keys.map((key, index) => (
            <SettingsFieldRow
              key={key}
              id={key}
              value={key}
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

export function BasicInfoPanel({ onBack, initialId }: { onBack: () => void; initialId?: string }) {
  const groups = useInfoGroups()
  const { templates } = useTemplates()
  const initialGroupId = initialId?.startsWith('group:') ? initialId.slice('group:'.length) : null
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialGroupId)
  const [activeFieldKind, setActiveFieldKind] = useState<FieldKind | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [deleting, setDeleting] = useState<InfoGroup | null>(null)

  const activeGroup = activeGroupId === null ? null : groups.find((group) => group.id === activeGroupId) ?? null
  const usageOf = (groupId: string): typeof templates =>
    templates.filter((doc) =>
      doc.components.some(
        (component) => component.id === 'info' && component.enabled && component.params?.group === groupId,
      ),
    )
  const usage = activeGroup ? usageOf(activeGroup.id) : []

  const createGroup = (): void => {
    void createInfoGroup({ name: nextGroupName(groups) })
      .then((group) => setActiveGroupId(group.id))
      .catch((err: unknown) => toast.error('新建失败', { description: err instanceof Error ? err.message : String(err) }))
  }

  const commitRename = (): void => {
    setRenaming(false)
    if (!activeGroup) return
    const next = nameDraft.trim()
    if (next === '' || next === activeGroup.name) return
    if (groups.some((group) => group.id !== activeGroup.id && group.name === next)) {
      toast.error(`已经有叫「${next}」的基本信息组件了`)
      return
    }
    void updateInfoGroup(activeGroup.id, { name: next }).catch((err: unknown) => {
      toast.error('改名失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  // 实体字段表
  if (activeFieldKind !== null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setActiveFieldKind(null)} aria-label="返回" className={ICON_BTN}>
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-sm font-medium text-ink">
            {FIELD_ROWS.find((row) => row.fieldKind === activeFieldKind)?.label ?? activeFieldKind}
          </span>
        </div>
        <FieldKindSettings kind={activeFieldKind} />
      </div>
    )
  }

  // 基本信息组件编辑器
  if (activeGroup) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setActiveGroupId(null)} aria-label="返回" className={ICON_BTN}>
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          {renaming ? (
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
                setNameDraft(activeGroup.name)
              }}
              title="重命名"
              className="text-sm font-medium text-ink transition-colors hover:text-ink-muted"
            >
              {activeGroup.name}
            </button>
          )}
          {isBuiltinInfoGroup(activeGroup.id) ? null : (
            <button type="button" onClick={() => setDeleting(activeGroup)} className={`${BTN_QUIET} ml-auto`}>
              <Trash2 size={13} strokeWidth={2} />
              删除
            </button>
          )}
        </div>

        {/* 反向关系：哪些模板选择了这个组件 */}
        {usage.length > 0 ? (
          <p className="truncate text-[11px] text-ink-faint">
            {usage.map((doc) => doc.name).join('、')} 在用
          </p>
        ) : null}

        <GroupFieldsSettings group={activeGroup} />

        <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除基本信息组件「{deleting?.name}」</AlertDialogTitle>
              <AlertDialogDescription>用它的模板会退回「全部字段」。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className={BTN_DANGER}
                onClick={() => {
                  const target = deleting
                  setDeleting(null)
                  if (!target) return
                  void deleteInfoGroup(target.id)
                    .then(() => {
                      setActiveGroupId(null)
                      toast.success(`已删除「${target.name}」`)
                    })
                    .catch((err: unknown) => toast.error('删除失败', { description: String(err) }))
                }}
              >
                删除组件
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // 列表
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 pb-1">
        <button type="button" onClick={onBack} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-sm text-ink">基本信息</span>
      </div>

      {/* 一张列表：内置（角色 / 事件 / 词条 / 宠物 / 武器）+ 自建。
          原来这里是「字段表」和「基本信息组件」两组 —— 同一件事的两种存储。
          列型宿主（角色 / 事件 / 词条）点进去是字段表编辑器，笔记型宿主进组件编辑器。 */}
      {groups.map((group) => {
        const count = usageOf(group.id).length
        const columnKind = columnKindOf(group.for)
        const ready = columnKind !== "event"
        return (
          <button
            key={group.id}
            type="button"
            disabled={!ready}
            onClick={() => {
              if (columnKind !== undefined) setActiveFieldKind(columnKind)
              else setActiveGroupId(group.id)
            }}
            className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{group.name}</span>
              {group.builtin ? null : <span className="shrink-0 text-[11px] text-ink-faint">自建</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink-faint">
              {ready ? (
                <>
                  <span>{group.fields.length} 个字段</span>
                  {columnKind === undefined ? <span>{count} 个模板</span> : null}
                  <ChevronRight size={16} strokeWidth={2} />
                </>
              ) : (
                <span>开发中</span>
              )}
            </span>
          </button>
        )
      })}
      <button type="button" onClick={createGroup} className={`${BTN_QUIET} mt-3 self-start`}>
        <Plus size={13} strokeWidth={2} />
        新建基本信息组件
      </button>
    </div>
  )
}
