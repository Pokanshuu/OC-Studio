'use client'

import type { Editor } from '@tiptap/core'
import { tauriReadClipboard } from '@/lib/tauri-clipboard'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'

/**
 * 编辑器右键菜单项定义。
 *
 * 抽出来的原因：这是一个约 145 行的数组字面量（含「插入」子菜单与表格子菜单的条件项），
 * 留在组件里会把「组装」这件事淹没。保持纯函数：给定 editor 与状态即返回菜单项。
 */
export function buildEditorContextMenu({
  editor,
  isTableActive,
  onFind,
}: {
  editor: Editor | null
  isTableActive: boolean
  onFind?: () => void
}): ContextMenuItem[] {
  return [    {
      label: '撤销',
      shortcut: 'Ctrl+Z',
      onClick: () => editor?.chain().focus().undo().run(),
    },
    {
      label: '重做',
      shortcut: 'Ctrl+Shift+Z',
      onClick: () => editor?.chain().focus().redo().run(),
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: '剪切',
      shortcut: 'Ctrl+X',
      onClick: () => {
        editor?.view.focus()
        try { document.execCommand('cut') } catch { /* noop */ }
      },
    },
    {
      label: '复制',
      shortcut: 'Ctrl+C',
      onClick: () => {
        editor?.view.focus()
        try { document.execCommand('copy') } catch { /* noop */ }
      },
    },
    {
      label: '粘贴',
      shortcut: 'Ctrl+V',
      onClick: () => {
        if (!editor) return
        editor.view.focus()
        tauriReadClipboard()
          .then((text) => { editor.chain().focus().insertContent(text).run() })
          .catch(() => {})
      },
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: '全选',
      shortcut: 'Ctrl+A',
      onClick: () => editor?.chain().focus().selectAll().run(),
    },
    ...(onFind
      ? ([
          { separator: true, label: '', onClick: () => {} },
          {
            label: '查找替换',
            shortcut: 'Ctrl+F',
            onClick: onFind,
          },
        ] as ContextMenuItem[])
      : []),
    { separator: true, label: '', onClick: () => {} },
    {
      label: '插入',
      children: [
        {
          label: '表格',
          onClick: () => {
            if (!editor) return
            const chain = editor.chain().focus()
            chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          },
        },
        {
          label: '图片',
          onClick: () => {
            if (!editor) return
            editor.chain().focus().insertContent({ type: 'imageBlock' }).run()
          },
        },
        {
          label: '分割线',
          onClick: () => {
            if (!editor) return
            const chain = editor.chain().focus()
            chain.setHorizontalRule().run()
          },
        },
      ],
    },
    ...(isTableActive
      ? [
          { separator: true, label: '', onClick: () => {} } as ContextMenuItem,
          {
            label: '表格',
            children: [
              {
                label: '在上方插入行',
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.addRowBefore().run()
                },
              },
              {
                label: '在下方插入行',
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.addRowAfter().run()
                },
              },
              {
                label: '在左侧插入列',
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.addColumnBefore().run()
                },
              },
              {
                label: '在右侧插入列',
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.addColumnAfter().run()
                },
              },
              { separator: true, label: '', onClick: () => {} } as ContextMenuItem,
              {
                label: '删除当前行',
                danger: true,
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.deleteRow().run()
                },
              },
              {
                label: '删除当前列',
                danger: true,
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.deleteColumn().run()
                },
              },
              {
                label: '删除整个表格',
                danger: true,
                onClick: () => {
                  if (!editor) return
                  const chain = editor.chain().focus()
                  chain.deleteTable().run()
                },
              },
            ],
          },
        ]
      : []),
  ]
}


