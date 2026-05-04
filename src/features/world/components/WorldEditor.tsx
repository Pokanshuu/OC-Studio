'use client'

import { useState, useCallback, useRef } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { Separator } from '@/components/ui/separator'
import type { WorldEntry } from '@/types'
import type { WorldFormData } from '../types'
import { useEntry, useUpdateEntry } from '../hooks/useWorldEntries'

interface WorldEditorProps {
  editEntryId: number
  onBack: () => void
}

export function WorldEditor({ editEntryId, onBack }: WorldEditorProps) {
  const { entry, loading, error } = useEntry(editEntryId)
  const { updateEntry } = useUpdateEntry()

  if (loading) return <div className="flex h-full items-center justify-center"><span className="text-sm text-ink-muted">加载中...</span></div>
  if (error) return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="text-sm text-error">{error}</span>
      <button onClick={onBack} className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink">返回</button>
    </div>
  )
  if (!entry) return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="text-sm text-ink-muted">词条不存在</span>
      <button onClick={onBack} className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink">返回</button>
    </div>
  )

  return <WorldEditorInner entry={entry} onBack={onBack} onSave={async (id, data) => { await updateEntry(id, data) }} />
}

function WorldEditorInner({
  entry, onBack, onSave,
}: { entry: WorldEntry; onBack: () => void; onSave: (id: number, data: Partial<WorldFormData>) => Promise<void> }) {
  const [title, setTitle] = useState(entry.title)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<Editor | null>(null)

  const handleReady = useCallback((editor: Editor) => { editorRef.current = editor }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const content = editorRef.current?.getHTML() ?? entry.content
      await onSave(entry.id as number, { title, content, category: entry.category, parentId: entry.parentId, order: entry.order, isConcept: entry.isConcept })
    } finally { setSaving(false) }
  }, [entry, title, onSave])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink">
            <ArrowLeft size={16} strokeWidth={2} /><span>返回</span>
          </button>
          <h2 className="text-lg text-ink">编辑词条</h2>
        </div>
        <button onClick={handleSave} disabled={saving || !title.trim()} className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-alt px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50">
          <Save size={16} strokeWidth={2} /><span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-8 py-6 space-y-8">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="词条标题" className="w-full bg-transparent text-xl text-ink placeholder:text-ink-faint focus:outline-none" />
          <Separator />
          <EditorCore onReady={handleReady} content={entry.content} placeholder="编写词条内容... 输入 @ 引用角色/事件/国家，输入 / 插入块" />
        </div>
      </div>
    </div>
  )
}
