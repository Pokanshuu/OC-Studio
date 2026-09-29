import type { Editor } from '@tiptap/core'

/**
 * 移动端选词工具栏通过 CustomEvent 下发的编辑命令（事件挂在编辑器 DOM 上）。
 * 由 `EditorCore` 在 `isMobile` 时绑定，返回解绑函数。
 */
export function bindMobileEditorEvents(editor: Editor): () => void {
  const dom = editor.view.dom
  const handlers: Record<string, () => void> = {
    'mobile:insert-image': () => editor.chain().focus().insertContent({ type: 'imageBlock' }).run(),
    'mobile:insert-table': () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    'mobile:insert-link': () => editor.chain().focus().toggleLink({ href: '' }).run(),
    'mobile:insert-code': () => editor.chain().focus().toggleCodeBlock().run(),
    'mobile:insert-divider': () => editor.chain().focus().setHorizontalRule().run(),
    'mobile:table-add-row-before': () => editor.chain().focus().addRowBefore().run(),
    'mobile:table-add-row-after': () => editor.chain().focus().addRowAfter().run(),
    'mobile:table-add-col-before': () => editor.chain().focus().addColumnBefore().run(),
    'mobile:table-add-col-after': () => editor.chain().focus().addColumnAfter().run(),
    'mobile:table-delete': () => editor.chain().focus().deleteTable().run(),
    'mobile:table-delete-row': () => editor.chain().focus().deleteRow().run(),
    'mobile:table-delete-col': () => editor.chain().focus().deleteColumn().run(),
  }
  for (const [name, fn] of Object.entries(handlers)) {
    dom.addEventListener(name, fn)
  }
  return () => {
    for (const [name, fn] of Object.entries(handlers)) {
      dom.removeEventListener(name, fn)
    }
  }
}
