'use client'

/**
 * 分类条目编辑器 —— **留在分类里**，不再跳去「世界观」。
 *
 * 分类条目本来就是 `worldEntries` 的一行，只是被 `category` 键圈进了某个分类。
 * 早先后点「新建」只是把 `activeItem` 设成「世界观」，于是人被扔进词条树 + 空白编辑区 ——
 * 那是词条编辑器，不是分类条目编辑器。这里给它一个自己的壳：
 *
 * - 页头与实体编辑器同一套壳（`EntityEditorShell`：48px 顶栏、格式工具条居中、
 *   返回在左、模板 / 历史在右），正文按 `分类绑定的模板` 渲染（模板里没接线的组件不出现）
 * - 数据仍写 `worldEntries` 原列：标题 / 正文走 `useWorldEntryDraft`，标签 / 简介即时写
 * - 单篇也能覆盖模板（落 `模板:` 键），选项与词条编辑器共用一套菜单
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useEntry } from '@/features/world/hooks/useWorldEntries'
import { useWorldEntryDraft } from '@/features/world/hooks/useWorldEntryDraft'
import { useNoteLinks } from '@/features/world/hooks/useNoteLinks'
import { WorldEntryBody } from '@/features/world/components/WorldEntryBody'
import { NoteTemplateContent } from '@/features/world/components/note/NoteTemplateContent'
import { templateFieldKeys, templateFieldLabels, templateFieldTypes } from '@/lib/templates/fields'
import { updateEntry } from '@/features/world/services'
import { useFields } from '@/lib/fields'
import { useTemplates } from '@/lib/templates/store'
import { noteTemplates } from '@/lib/templates/note'
import { useInfoGroups } from '@/lib/templates/info-groups'
import type { Category } from '@/lib/categories/types'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { BTN_QUIET, CENTER_STATE, LOADING_TEXT } from '@/lib/ui-tokens'

interface CategoryEntryEditorProps {
  entryId: number
  category: Category
  onBack: () => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CategoryEntryEditor(props: CategoryEntryEditorProps) {
  const { entry, loading, error } = useEntry(props.entryId)

  if (loading) {
    return (
      <div className={CENTER_STATE}>
        <span className={LOADING_TEXT}>加载中…</span>
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-error">{error ?? '条目不存在'}</span>
        <button type="button" onClick={props.onBack} className={BTN_QUIET}>
          返回
        </button>
      </div>
    )
  }

  // key = id：切条目时状态整体重来，不在 effect 里同步，避免把正在输入的值顶掉
  return <CategoryEntryEditorInner key={entry.id} entry={entry} {...props} />
}

function CategoryEntryEditorInner({
  entry,
  category,
  onBack,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: CategoryEntryEditorProps & { entry: WorldEntry }) {
  const entryId = entry.id
  const queryClient = useQueryClient()
  const { templates } = useTemplates()
  const infoGroups = useInfoGroups()
  const worldFields = useFields('worldEntry')
  const showTags = worldFields.some((field) => field.id === 'tags')

  const [title, setTitle] = useState(entry.title)
  const [tags, setTags] = useState<number[]>(entry.tags ?? [])
  const [templateOverride, setTemplateOverride] = useState<string | null>(null)
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['worldEntries'] })
  }, [queryClient])

  const { handleContentChange, handleTitleChange, handleEditorReady, flushSave } = useWorldEntryDraft({
    selectedId: entryId,
    currentEntry: entry,
    refresh,
    title,
    setTitle,
  })

  // 被引用：哪些笔记在正文里 [[链接]] / @ 引用了这一条（与世界编辑器共用同一份查询）
  const { backlinks } = useNoteLinks(entryId)

  // 模板解析顺序：单篇覆盖（模板:）→ 分类绑定 → 内置词条模板
  const requestedTemplate =
    templateOverride !== null
      ? (templateOverride.trim() || category.template)
      : (entry.template?.trim() || category.template)
  const entryTemplate =
    templates.find((doc) => doc.id === requestedTemplate || doc.name === requestedTemplate) ??
    templates.find((doc) => doc.id === 'entry') ??
    templates[0]
  /** 模板自己的字段（宠物：物种 / 习性；武器：材质 / 制造者）；没声明 = 字段表全部自定义字段 */
  const fieldKeys = useMemo(
    () => (entryTemplate ? templateFieldKeys(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )
  const fieldTypes = useMemo(
    () => (entryTemplate ? templateFieldTypes(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )
  const fieldLabels = useMemo(
    () => (entryTemplate ? templateFieldLabels(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )

  const handleTagsChange = useCallback((ids: number[]) => {
    setTags(ids)
    void updateEntry(entryId, { tags: ids }).catch((err: unknown) => {
      toast.error('标签保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [entryId])

  const handleBack = useCallback(async () => {
    try {
      await flushSave()
    } finally {
      onBack()
    }
  }, [flushSave, onBack])

  // 卸载时把还没落盘的标题 / 正文补上（简介 / 时间 / 地点由各自的区块 flush）
  useEffect(() => {
    return () => {
      void flushSave()
    }
  }, [flushSave])

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    handleEditorReady(editor)
  }

  return (
    <>
      <EntityEditorShell
        title={category.name}
        onBack={() => void handleBack()}
        editor={bodyEditor}
        headerRight={
          <>
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setTemplateMenu({ x: Math.max(8, rect.right - 160), y: rect.bottom + 4 })
              }}
              className={BTN_QUIET}
              title="这篇用哪个模板"
            >
              {entryTemplate?.name ? `模板 · ${entryTemplate.name}` : '模板'}
            </button>
            <EntityHistoryButton table="worldEntries" id={entry.id} name={title} />
          </>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="h-12 shrink-0" aria-hidden />
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
            {entryTemplate ? (
              <NoteTemplateContent
                entry={entry}
                template={entryTemplate}
                title={title}
                onTitleChange={handleTitleChange}
                titlePlaceholder="名称"
                tags={tags}
                onTagsChange={handleTagsChange}
                showTags={showTags}
                backlinks={backlinks}
                onNavigateNote={(id) => onWikiLinkClick?.(String(id))}
                body={
                  <WorldEntryBody
                    selectedId={entryId}
                    pane={false}
                    placeholder="编写内容… 输入 @ 引用，输入 / 插入块"
                    onReady={handleBodyReady}
                    onContentChange={handleContentChange}
                    onMentionClick={onMentionClick}
                    onCharacterCount={onCharacterCount}
                    onWikiLinkClick={onWikiLinkClick}
                  />
                }
                fieldKeys={fieldKeys}
                fieldTypes={fieldTypes}
                fieldLabels={fieldLabels}
              />
            ) : null}
          </div>
        </div>
      </EntityEditorShell>

      {templateMenu ? (
        <MediaContextMenu
          at={templateMenu}
          onClose={() => setTemplateMenu(null)}
          items={[
            {
              label: `跟随分类（${category.name}）`,
              onSelect: () => {
                setTemplateOverride('')
                void updateEntry(entryId, { template: '' }).catch((err: unknown) =>
                  toast.error('模板保存失败', { description: String(err) }),
                )
              },
            },
            ...noteTemplates(templates).map((template) => ({
              label: template.name,
              onSelect: () => {
                setTemplateOverride(template.name)
                void updateEntry(entryId, { template: template.name }).catch((err: unknown) =>
                  toast.error('模板保存失败', { description: String(err) }),
                )
              },
            })),
          ]}
        />
      ) : null}
    </>
  )
}
