'use client'

/**
 * 「正文组件」的骨架编辑器 —— 设置里一页、模板参数里一个抽屉，两处共用这一份。
 *
 * 写的是**组件自己的 Markdown**（`.ocstudio/body-groups.json`），不是模板：
 * 模板只存「选了哪一个」（`body.params.group`），和基本信息组件同一套关系。
 *
 * 两个要点：
 * - **存 Markdown**：库文件可读、可手改；铺进正文时才转成编辑器文档
 *   （`bodyDocFromMarkdown(…, { unresolvedLinks: 'keep' })`，骨架里写 `[[主角]]` 不会被吃掉）
 * - **没改就不写**：打开看一眼不算编辑（组件表也是整份重写）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { toast } from 'sonner'
import { EditorCore } from '@/components/editor/EditorCore'
import { findBodyGroup, updateBodyGroup } from '@/lib/templates/body-groups'
import { bodyPresetFromDoc } from '@/lib/templates/body-preset'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'

/** 落盘延迟：一次输入一串字只写一次（组件表是整份文件重写） */
const SAVE_DELAY = 600

export function BodyPresetEditor({ groupId }: { groupId: string }) {
  const editorRef = useRef<Editor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 打开时的文档签名：没改过就不写 */
  const baselineRef = useRef<string | null>(null)

  // 初始内容只在挂载时算一次（调用方按组件 id 重建）
  const [initial] = useState(() => {
    const markdown = findBodyGroup(groupId)?.markdown ?? ''
    const doc = markdown
      ? bodyDocFromMarkdown(markdown, { unresolvedLinks: 'keep' })
      : { type: 'doc', content: [{ type: 'paragraph' }] }
    return { markdown, doc: doc as Record<string, unknown> }
  })
  /** 上次写盘的内容：没变就不写 */
  const savedRef = useRef(initial.markdown)

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const editor = editorRef.current
    if (!editor) return
    if (baselineRef.current === JSON.stringify(editor.getJSON())) return
    const markdown = bodyPresetFromDoc(editor.getJSON())
    if (markdown === savedRef.current) return
    savedRef.current = markdown
    void updateBodyGroup(groupId, { markdown }).catch((err: unknown) => {
      toast.error('正文组件没保存上', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [groupId])

  const schedule = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, SAVE_DELAY)
  }, [flush])

  // 离开（返回 / 关抽屉）时把还没落盘的那一下补上：600ms 内的最后一段字不该丢
  useEffect(() => flush, [flush])

  return (
    <EditorCore
      plain
      key={groupId}
      content={initial.doc}
      placeholder="写下骨架…"
      onReady={(editor) => {
        editorRef.current = editor
        if (baselineRef.current === null) baselineRef.current = JSON.stringify(editor.getJSON())
      }}
      onContentChange={schedule}
    />
  )
}
