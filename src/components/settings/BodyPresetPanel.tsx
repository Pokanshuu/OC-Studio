'use client'

/**
 * 设置 › 世界 › 自定义组件 › 正文。
 *
 * 和「基本信息」同构：**正文组件是独立的一层**（`lib/templates/body-groups.ts`），
 * 一个组件 = 一份名字 + 一份骨架（Markdown），可被多个模板复用；模板只存
 * `body.params.group = <id>`。内置组件可改不可删，自建组件可删。
 *
 * 编辑面就是我们的编辑器内核（`BodyPresetEditor`）—— 骨架里能放标题、列表、图片、
 * `[[词条]]`，和写正文的手感一致。
 */
import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { BodyPresetEditor } from '@/components/settings/BodyPresetEditor'
import {
  createBodyGroup,
  deleteBodyGroup,
  isBuiltinBodyGroup,
  updateBodyGroup,
  useBodyGroups,
  type BodyGroup,
} from '@/lib/templates/body-groups'
import { bodyGroupHasPreset } from '@/lib/templates/body-preset'
import { useTemplates } from '@/lib/templates/store'
import { BTN_QUIET, ICON_BTN, INPUT_LINE, SETTINGS_EMPTY } from '@/lib/ui-tokens'
import { isImeComposing } from '@/lib/ime'

function nextName(groups: readonly BodyGroup[]): string {
  const names = new Set(groups.map((group) => group.name))
  let name = '新正文组件'
  let counter = 2
  while (names.has(name)) {
    name = `新正文组件 ${counter}`
    counter += 1
  }
  return name
}

/** 一个正文组件值多少字（给人一个「设没设」的直觉） */
function wordCount(markdown: string): number {
  return markdown.replace(/\s+/g, '').length
}

export function BodyPresetPanel({ onBack, initialId }: { onBack: () => void; initialId?: string }) {
  const groups = useBodyGroups()
  const { templates } = useTemplates()
  const initialGroupId = initialId?.startsWith('body:') ? initialId.slice('body:'.length) : null
  const [activeId, setActiveId] = useState<string | null>(initialGroupId)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const active = activeId === null ? null : groups.find((group) => group.id === activeId) ?? null
  /** 哪些模板选了这份组件（删不掉 / 改名时给个底） */
  const usage = useMemo(() => {
    if (!active) return []
    return templates.filter((doc) =>
      doc.components.some(
        (component) => component.id === 'body' && component.enabled && component.params?.group === active.id,
      ),
    )
  }, [active, templates])

  const createGroup = (): void => {
    void createBodyGroup({ name: nextName(groups) })
      .then((group) => setActiveId(group.id))
      .catch((err: unknown) => {
        toast.error('新建失败', { description: err instanceof Error ? err.message : String(err) })
      })
  }

  const commitRename = (): void => {
    setRenaming(false)
    if (!active) return
    const next = nameDraft.trim()
    if (next === '' || next === active.name) return
    if (groups.some((group) => group.id !== active.id && group.name === next)) {
      toast.error(`已经有叫「${next}」的正文组件了`)
      return
    }
    void updateBodyGroup(active.id, { name: next }).catch((err: unknown) => {
      toast.error('改名失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  if (active) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setActiveId(null)} aria-label="返回" className={ICON_BTN}>
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                // 组字中的回车是「选候选词」/ Esc 是「取消组字」：此时不提交、不关闭
                if (isImeComposing(event)) return
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
                setNameDraft(active.name)
              }}
              title="重命名"
              className="text-sm font-medium text-ink transition-colors hover:text-ink-muted"
            >
              {active.name}
            </button>
          )}
          {isBuiltinBodyGroup(active.id) ? null : (
            <button
              type="button"
              onClick={() => {
                void deleteBodyGroup(active.id)
                  .then(() => setActiveId(null))
                  .catch((err: unknown) => {
                    toast.error('删除失败', { description: err instanceof Error ? err.message : String(err) })
                  })
              }}
              className={`${BTN_QUIET} ml-auto`}
            >
              <Trash2 size={13} strokeWidth={2} />
              删除
            </button>
          )}
        </div>
        <p className={SETTINGS_EMPTY}>
          {usage.length > 0 ? `${usage.length} 个模板在用` : '新建条目时铺进正文'}
        </p>
        <BodyPresetEditor key={active.id} groupId={active.id} />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 pb-1">
        <button type="button" onClick={onBack} aria-label="返回" className={ICON_BTN}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-sm text-ink">正文</span>
      </div>

      {groups.length === 0 ? <p className={SETTINGS_EMPTY}>还没有正文组件</p> : null}

      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => setActiveId(group.id)}
          className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors last:border-b-0 hover:bg-[var(--oc-hover)]"
        >
          <span>{group.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
            {bodyGroupHasPreset(group) ? `${wordCount(group.markdown)} 字` : '空'}
          </span>
        </button>
      ))}

      <button type="button" onClick={createGroup} className={`${BTN_QUIET} mt-3 self-start`}>
        <Plus size={13} strokeWidth={2} />
        新建正文组件
      </button>
    </div>
  )
}
