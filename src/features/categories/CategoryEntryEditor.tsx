'use client'

/**
 * 分类条目编辑器 —— **留在分类里**，不再跳去「世界观」。
 *
 * 分类条目本来就是 `worldEntries` 的一行，只是被 `category` 键圈进了某个分类。
 * 早先后点「新建」只是把 `activeItem` 设成「世界观」，于是人被扔进词条树 + 空白编辑区 ——
 * 那是词条编辑器，不是分类条目编辑器。这里给它一个自己的壳：
 *
 * - 页头是分类名 + 返回，正文按 `分类绑定的模板` 渲染（模板里没接线的组件不出现）
 * - 数据仍写 `worldEntries` 原列：标题 / 正文走 `useWorldEntryDraft`，标签 / 简介即时写
 * - 单篇也能覆盖模板（落 `模板:` 键），选项与词条编辑器共用一套菜单
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { useEntry } from '@/features/world/hooks/useWorldEntries'
import { useWorldEntryDraft } from '@/features/world/hooks/useWorldEntryDraft'
import { WorldEntryBody } from '@/features/world/components/WorldEntryBody'
import { WorldCoverField } from '@/features/world/components/WorldCoverField'
import { WorldCustomFields } from '@/features/world/components/WorldCustomFields'
import { WorldMetaFields, WorldTitleField } from '@/features/world/components/WorldFrontmatter'
import { docHasRef } from '@/features/world/components/world-content-utils'
import { updateEntry } from '@/features/world/services'
import { db } from '@/lib/db'
import { useFields } from '@/lib/fields'
import { useTemplates } from '@/lib/templates/store'
import { noteTemplates } from '@/lib/templates/note'
import { templateFieldKeys } from '@/lib/templates/fields'
import type { Category } from '@/lib/categories/types'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { ListShell } from '@/components/shared/ListShell'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { BTN_QUIET, CENTER_STATE, LOADING_TEXT, SECTION_TITLE_BARE } from '@/lib/ui-tokens'

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
  const worldFields = useFields('worldEntry')
  const showTags = worldFields.some((field) => field.id === 'tags')

  const [title, setTitle] = useState(entry.title)
  const [tags, setTags] = useState<number[]>(entry.tags ?? [])
  const [summary, setSummary] = useState(entry.summary ?? '')
  const [backlinks, setBacklinks] = useState<{ id: number; title: string }[]>([])
  const [templateOverride, setTemplateOverride] = useState<string | null>(null)
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedSummaryRef = useRef(entry.summary ?? '')
  const summaryRef = useRef(entry.summary ?? '')

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

  // 被引用：哪些笔记在正文里 [[链接]] / @ 引用了这一条（分类条目不在 getEntries 的列表里，单独扫）
  useEffect(() => {
    let cancelled = false
    void db.worldEntries
      .filter((row) => !row.deleted && row.id !== entryId && typeof row.content === 'string' && row.content.includes(String(entryId)))
      .toArray()
      .then((rows) => {
        if (cancelled) return
        const found: { id: number; title: string }[] = []
        for (const row of rows) {
          try {
            if (docHasRef(JSON.parse(row.content), String(entryId))) found.push({ id: row.id, title: row.title })
          } catch {
            // 旧数据可能不是 JSON，忽略
          }
        }
        setBacklinks(found)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [entryId])

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
    () => (entryTemplate ? templateFieldKeys(entryTemplate) : undefined),
    [entryTemplate],
  )

  const handleTagsChange = useCallback((ids: number[]) => {
    setTags(ids)
    void updateEntry(entryId, { tags: ids }).catch((err: unknown) => {
      toast.error('标签保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [entryId])

  const saveSummary = useCallback(async (value: string) => {
    if (value === savedSummaryRef.current) return
    try {
      await updateEntry(entryId, { summary: value })
      savedSummaryRef.current = value
    } catch (err) {
      toast.error('简介保存失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }, [entryId])

  const handleSummaryChange = useCallback((value: string) => {
    setSummary(value)
    summaryRef.current = value
    if (summaryTimer.current) clearTimeout(summaryTimer.current)
    summaryTimer.current = setTimeout(() => {
      summaryTimer.current = null
      void saveSummary(value)
    }, 800)
  }, [saveSummary])

  const handleBack = useCallback(async () => {
    if (summaryTimer.current) {
      clearTimeout(summaryTimer.current)
      summaryTimer.current = null
    }
    try {
      await saveSummary(summary)
      await flushSave()
    } finally {
      onBack()
    }
  }, [flushSave, onBack, saveSummary, summary])

  // 切条目 / 卸载时把还没落盘的标题、正文、简介补上
  useEffect(() => {
    return () => {
      if (summaryTimer.current) {
        clearTimeout(summaryTimer.current)
        summaryTimer.current = null
      }
      void saveSummary(summaryRef.current)
      void flushSave()
    }
  }, [flushSave, saveSummary])

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    handleEditorReady(editor)
  }

  return (
    <>
      <ListShell
        header={() => (
          <>
            <PageToolbar
              title={category.name}
              sticky={false}
              hideTitleOnMobile
              onBack={() => void handleBack()}
              actions={
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
            />
            {bodyEditor ? (
              <div className="flex h-10 items-center px-3">
                <EditorToolbar editor={bodyEditor} embedded />
              </div>
            ) : null}
          </>
        )}
        bodyClassName="px-4 md:px-6"
      >
        <div className="mx-auto w-full max-w-3xl pb-24 pt-3">
          {entryTemplate ? (
            <TemplateRenderer
              template={entryTemplate}
              render={(component) => {
                switch (component.id) {
                  case 'cover':
                    return <WorldCoverField entry={entry} />
                  case 'info':
                    return (
                      <div className="flex flex-col gap-3">
                        <WorldTitleField
                          title={title}
                          onTitleChange={handleTitleChange}
                          placeholder="名称"
                        />
                        <WorldCustomFields key={entry.id} entry={entry} fieldKeys={fieldKeys} />
                      </div>
                    )
                  case 'tags':
                    if (!showTags && backlinks.length === 0) return null
                    return (
                      <WorldMetaFields
                        tags={tags}
                        onTagsChange={handleTagsChange}
                        showTags={showTags}
                        backlinks={backlinks}
                        onSelectBacklink={(id) => onWikiLinkClick?.(String(id))}
                      />
                    )
                  case 'summary':
                    return (
                      <section>
                        <h3 className={`mb-3 ${SECTION_TITLE_BARE}`}>简介</h3>
                        <textarea
                          value={summary}
                          onChange={(event) => handleSummaryChange(event.target.value)}
                          rows={3}
                          placeholder="一句话说明"
                          className="w-full resize-none bg-transparent text-sm leading-6 text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                      </section>
                    )
                  case 'body':
                    return (
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
                    )
                  default:
                    return null
                }
              }}
            />
          ) : null}
        </div>
      </ListShell>

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
