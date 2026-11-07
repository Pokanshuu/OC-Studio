'use client'

/**
 * 设置 › 世界 › 自定义组件 › 正文。
 *
 * 正文组件唯一的可配置项：**预设段落**（`body.params.preset`）。
 * 新建条目时把这份骨架铺进正文，写的人不用每次都从空页开始。
 *
 * 三个刻意的选择：
 * - **存 Markdown**：模板文件（`.ocstudio/templates/<id>.md`）要能读、能手改、能跟着库走；
 *   铺进去时才转成编辑器文档（`lib/templates/body-preset.ts`）
 * - **编辑器就是我们自己的内核**：不另写一个文本框 —— 骨架里要能放标题、列表、图片、
 *   `[[词条]]`，只有同一个编辑器内核才保证「设置里长什么样，新建出来就是什么样」
 * - **改完自动存**（600ms）：这里没有「保存」按钮，和模板编排的其它入口一致
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { EditorCore } from '@/components/editor/EditorCore'
import {
  bodyPresetFromDoc,
  bodyPresetMarkdown,
  hasBodyComponent,
  hasBodyPreset,
} from '@/lib/templates/body-preset'
import { setTemplateComponentParam, useTemplates } from '@/lib/templates/store'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'
import { ICON_BTN, SETTINGS_EMPTY } from '@/lib/ui-tokens'

/** 落盘延迟：一次输入一串字只写一次（模板是整份文件重写） */
const SAVE_DELAY = 600

export function BodyPresetPanel({ onBack }: { onBack: () => void }) {
  const { templates } = useTemplates()
  const [activeId, setActiveId] = useState<string | null>(null)

  /** 只有含正文组件的模板才配得上预设（没有正文，设了也没地方铺） */
  const rows = useMemo(() => templates.filter(hasBodyComponent), [templates])
  const active = rows.find((doc) => doc.id === activeId) ?? null

  if (active !== null) {
    return (
      <PresetEditor
        key={active.id}
        templateId={active.id}
        name={active.name}
        onBack={() => setActiveId(null)}
      />
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

      {rows.length === 0 ? (
        <p className={SETTINGS_EMPTY}>没有含正文的模板</p>
      ) : (
        rows.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setActiveId(doc.id)}
            className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors last:border-b-0 hover:bg-[var(--oc-hover)]"
          >
            <span>{doc.name}</span>
            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
              {hasBodyPreset(doc.id) ? '已设' : ''}
              <ChevronRight size={16} strokeWidth={2} />
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function PresetEditor({
  templateId,
  name,
  onBack,
}: {
  templateId: string
  name: string
  onBack: () => void
}) {
  const editorRef = useRef<Editor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 初始内容只在挂载时算一次（组件按模板 id 重建）：编辑器自己持有文档，之后以它为准
  const [initial] = useState(() => {
    const markdown = bodyPresetMarkdown(templateId)
    return { markdown, doc: bodyDocFromMarkdown(markdown) as Record<string, unknown> }
  })
  /** 上次写盘的内容：没变就不写（切来切去不该反复重写模板文件） */
  const savedRef = useRef(initial.markdown)
  const initialDoc = initial.doc

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const editor = editorRef.current
    if (!editor) return
    const markdown = bodyPresetFromDoc(editor.getJSON())
    if (markdown === savedRef.current) return
    savedRef.current = markdown
    void setTemplateComponentParam(templateId, 'body', 'preset', markdown).catch((err: unknown) => {
      toast.error('正文预设没保存上', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [templateId])

  const schedule = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, SAVE_DELAY)
  }, [flush])

  // 离开（返回 / 关设置）时把还没落盘的那一下补上：600ms 内的最后一段字不该丢
  useEffect(() => flush, [flush])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            flush()
            onBack()
          }}
          aria-label="返回"
          className={ICON_BTN}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <span className="text-sm font-medium text-ink">{name}</span>
      </div>
      <p className={SETTINGS_EMPTY}>新建这条模板的条目时铺进正文；留空就不铺。</p>
      <EditorCore
        plain
        key={templateId}
        content={initialDoc}
        placeholder="写下骨架…"
        onReady={(editor) => {
          editorRef.current = editor
        }}
        onContentChange={schedule}
      />
    </div>
  )
}
