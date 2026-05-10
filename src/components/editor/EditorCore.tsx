'use client'

import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Mention from '@tiptap/extension-mention'
import { DragHandle } from '@tiptap/extension-drag-handle'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { Bold, Italic, Underline as UnderlineIcon, Image as ImageIcon, AtSign } from 'lucide-react'
import React from 'react'

import { BlockTypeMenu } from './BlockTypeMenu'
import { SlashCommand } from './SlashCommandMenu'
import { WikiLinkExtension } from './WikiLinkExtension'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { adjustSuggestionPosition } from '@/lib/menu-utils'
import type { ReferableEntity } from '@/lib/reference-registry'
import { useDevice } from '@/lib/use-device'
import { ContextMenu } from '@/components/shared/ContextMenu'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'

const BLOCK_MENU_EVENT = 'editor-block-menu'

interface ExtendedReferableEntity extends ReferableEntity {
  label: string
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
}

const ImagePlaceholderNode = Node.create({
  name: 'imagePlaceholder',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'div[data-type="image-placeholder"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'image-placeholder', ...HTMLAttributes }]
  },
  addNodeView() { return ReactNodeViewRenderer(ImagePlaceholderView) },
})

function ImagePlaceholderView() {
  return (
    <NodeViewWrapper>
      <div className="border-dashed border border-line rounded-md h-40 flex flex-col items-center justify-center gap-2" contentEditable={false}>
        <ImageIcon size={24} strokeWidth={1.5} className="text-ink-faint" />
        <span className="text-sm text-ink-faint">点击上传图片（功能开发中）</span>
      </div>
    </NodeViewWrapper>
  )
}

function createMentionRender() {
  let popup: HTMLElement | null = null

  const isComposing = (editor: Editor): boolean => {
    return (editor as unknown as { view: { composing: boolean } }).view?.composing ?? false
  }

  return () => ({
    onStart: (props: SuggestionProps<ReferableEntity>) => {
      if (!props.clientRect || props.items.length === 0) return
      if (isComposing(props.editor)) return
      popup = document.createElement('div')
      popup.className = 'absolute z-50 max-h-56 overflow-auto rounded-md border border-line bg-paper/90 backdrop-blur-sm p-1 shadow-none ring-1 ring-black/5 min-w-[200px]'
      const rect = props.clientRect()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      renderMentionGroups(popup, props.items, props.command)
      document.body.appendChild(popup)
      if (rect) {
        requestAnimationFrame(() => {
          if (!popup) return
          const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
          popup.style.left = `${adjusted.x}px`
          popup.style.top = `${adjusted.y}px`
        })
      }
    },
    onUpdate: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      if (!popup || props.items.length === 0) { popup?.remove(); popup = null; return }
      const rect = props.clientRect?.()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      popup.innerHTML = ''
      renderMentionGroups(popup, props.items, props.command)
      if (rect) {
        const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
        popup.style.left = `${adjusted.x}px`
        popup.style.top = `${adjusted.y}px`
      }
    },
    onExit: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      popup?.remove()
      popup = null
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') { popup?.remove(); popup = null; return true }
      return false
    },
  })
}

function renderMentionGroups(
  container: HTMLElement,
  items: ReferableEntity[],
  command: (item: ReferableEntity) => void,
) {
  const groups: Record<string, ReferableEntity[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type].push(item)
  }
  const orderedTypes = Object.keys(groups).sort()
  for (const type of orderedTypes) {
    if (orderedTypes.length > 1) {
      const hdr = document.createElement('div')
      hdr.className = 'px-3 py-1.5 text-xs font-medium text-ink-faint'
      hdr.textContent = ENTITY_TYPE_LABELS[type] ?? type
      container.appendChild(hdr)
    }
    for (const item of groups[type]) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-paper-alt'
      btn.innerHTML = `<span>${item.name}</span><span class="ml-auto text-xs text-ink-faint">${ENTITY_TYPE_LABELS[item.type] ?? item.type}</span>`
      btn.addEventListener('click', () => command(item))
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      container.appendChild(btn)
    }
  }
}

interface EditorCoreProps {
  onReady: (editor: Editor) => void
  onCharacterCount?: (count: number) => void
  onContentChange?: (content: string) => void
  content?: string | object
  placeholder?: string
  onMentionClick?: (id: string, entityType?: string) => void
  onWikiLinkClick?: (id: string) => void
  plain?: boolean
}

export function EditorCore({
  onReady, onCharacterCount, onContentChange, content, placeholder, onMentionClick, onWikiLinkClick, plain,
}: EditorCoreProps) {
  const editorId = useId()
  const [blockMenuPosition, setBlockMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [blockMenuPos, setBlockMenuPos] = useState<number | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [isTableActive, setIsTableActive] = useState(false)
  const { isMobile } = useDevice()

  const handleBlockMenuEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.editorId === editorId) {
      setBlockMenuPosition({ x: detail.rect.left, y: detail.rect.top })
      setBlockMenuPos(detail.blockPos as number | undefined)
    }
  }, [editorId])

  const closeBlockMenu = useCallback(() => { setBlockMenuPosition(null); setBlockMenuPos(undefined) }, [])

  useEffect(() => {
    window.addEventListener(BLOCK_MENU_EVENT, handleBlockMenuEvent)
    return () => window.removeEventListener(BLOCK_MENU_EVENT, handleBlockMenuEvent)
  }, [handleBlockMenuEvent])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        paragraph: false,
        blockquote: {
          HTMLAttributes: { class: 'border-l-2 border-line pl-4 bg-paper-alt rounded-r-sm italic text-ink-muted my-3 py-1' },
        },
      }),
      Paragraph.extend({
        addAttributes() {
          return {
            placeholder: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-placeholder'),
              renderHTML: (attrs) => {
                if (!attrs.placeholder) return {}
                return { 'data-placeholder': attrs.placeholder }
              },
            },
          }
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'paragraph') {
            return (node.attrs.placeholder as string | null) ?? placeholder ?? '开始创作你的世界...'
          }
          return placeholder ?? '开始创作你的世界...'
        },
      }),
      TaskList, TaskItem.configure({ nested: true }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'w-full border-collapse rounded-md overflow-hidden' },
      }),
      TableRow.configure({
        HTMLAttributes: { class: 'border-b border-line' },
      }),
      TableCell.configure({
        HTMLAttributes: { class: 'border border-line px-3 py-2 text-sm text-ink' },
      }),
      TableHeader.configure({
        HTMLAttributes: { class: 'border border-line bg-paper-alt px-3 py-2 text-sm font-medium text-ink text-left' },
      }),
      ImagePlaceholderNode,
      SlashCommand,
      WikiLinkExtension,
      ...(isMobile ? [] : [
        // eslint-disable-next-line react-hooks/refs
        DragHandle.configure({
        render: () => {
          const handle = document.createElement('div')
          handle.className = 'flex h-5 w-5 items-center justify-center cursor-grab rounded text-ink-faint opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100'
          handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="10" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/><circle cx="10" cy="10" r="1"/></svg>`
          handle.title = '拖拽排序'
          handle.dataset.blockHandle = 'true'
          handle.addEventListener('click', (e) => {
            e.stopPropagation()
            const ed = editorRef.current
            const rect = handle.getBoundingClientRect()
            const blockPos = ed ? ed.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos : undefined
            window.dispatchEvent(new CustomEvent(BLOCK_MENU_EVENT, { detail: { editorId, rect, blockPos } }))
          })
          return handle
        },
        nested: true,
      })]),
      Mention.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            entityType: {
              default: '',
              parseHTML: (element) => element.getAttribute('data-entity-type') || '',
              renderHTML: (attributes) => ({ 'data-entity-type': attributes.entityType }),
            },
          }
        },
      }).configure({
        HTMLAttributes: {
          class: 'inline-flex bg-paper-alt border border-line rounded px-1.5 text-sm text-ink cursor-pointer',
        },
        renderHTML: ({ options, node }) => {
          const cls = options.HTMLAttributes?.class ?? ''
          const label = (node.attrs.label as string) ?? ''
          return ['span', {
            class: cls,
            'data-type': 'mention',
            'data-id': node.attrs.id as string ?? '',
            'data-label': label,
            'data-entity-type': node.attrs.entityType as string ?? '',
          }, `@${label}`]
        },
        suggestion: {
          char: '@',
          items: async ({ query }) => {
            const entities = await searchAllEntitiesFlat(query)
            return entities.filter((e) => e.type !== 'world').map((e) => ({ ...e, label: e.name }))
          },
          render: createMentionRender(),
          command: ({ editor, range, props }) => {
            const p = props as ExtendedReferableEntity
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: 'mention',
                attrs: {
                  id: p.id,
                  label: p.label ?? p.name,
                  entityType: p.type,
                },
              })
              .run()
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: plain
          ? 'tiptap max-w-none pl-0 pr-0 py-0 text-[15px] leading-relaxed focus:outline-none min-h-[2em]'
          : 'tiptap max-w-none pl-8 pr-4 py-2 text-[15px] leading-relaxed focus:outline-none min-h-[2em]',
      },
    },
    content: content ?? '',
    onCreate({ editor: readyEditor }) {
      editorRef.current = readyEditor as Editor
      onReady(readyEditor as Editor)
      onCharacterCount?.(readyEditor.getText().length)
      onContentChange?.(readyEditor.getHTML())
    },
    onUpdate({ editor: updatedEditor }) {
      onCharacterCount?.(updatedEditor.getText().length)
      onContentChange?.(updatedEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const updateTableState = () => {
      setIsTableActive(editor.isActive('table'))
    }
    editor.on('selectionUpdate', updateTableState)
    editor.on('transaction', updateTableState)
    return () => {
      editor.off('selectionUpdate', updateTableState)
      editor.off('transaction', updateTableState)
    }
  }, [editor])

  const contextMenuItems = useMemo((): ContextMenuItem[] => [
    {
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
      onClick: () => { try { document.execCommand('cut') } catch { /* noop */ } },
    },
    {
      label: '复制',
      shortcut: 'Ctrl+C',
      onClick: () => { try { document.execCommand('copy') } catch { /* noop */ } },
    },
    {
      label: '粘贴',
      shortcut: 'Ctrl+V',
      onClick: () => { try { document.execCommand('paste') } catch { /* noop */ } },
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: '全选',
      shortcut: 'Ctrl+A',
      onClick: () => { try { document.execCommand('selectAll') } catch { /* noop */ } },
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: '插入',
      children: [
        {
          label: '表格',
          onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        },
        {
          label: '图片占位符',
          onClick: () => editor?.chain().focus().setNode('imagePlaceholder').run(),
        },
        {
          label: '分割线',
          onClick: () => editor?.chain().focus().setHorizontalRule().run(),
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
                onClick: () => editor?.chain().focus().addRowBefore().run(),
              },
              {
                label: '在下方插入行',
                onClick: () => editor?.chain().focus().addRowAfter().run(),
              },
              {
                label: '在左侧插入列',
                onClick: () => editor?.chain().focus().addColumnBefore().run(),
              },
              {
                label: '在右侧插入列',
                onClick: () => editor?.chain().focus().addColumnAfter().run(),
              },
              { separator: true, label: '', onClick: () => {} } as ContextMenuItem,
              {
                label: '删除当前行',
                danger: true,
                onClick: () => editor?.chain().focus().deleteRow().run(),
              },
              {
                label: '删除当前列',
                danger: true,
                onClick: () => editor?.chain().focus().deleteColumn().run(),
              },
              {
                label: '删除整个表格',
                danger: true,
                onClick: () => editor?.chain().focus().deleteTable().run(),
              },
            ],
          },
        ]
      : []),
  ], [editor, isTableActive])

  if (!editor) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-muted">编辑器加载中...</div>
  }

  return (
    <ContextMenu items={contextMenuItems}>
    <div
      className={plain
        ? 'relative'
        : 'relative rounded-md border border-transparent bg-paper transition-colors hover:border-line focus-within:border-line-hover'
      }
      onClick={(e) => {
        const target = e.target as HTMLElement
        const mentionEl = target.closest?.('[data-type="mention"]') as HTMLElement | null
        if (mentionEl && onMentionClick) {
          const id = mentionEl.dataset.id
          if (id) {
            e.preventDefault()
            e.stopPropagation()
            onMentionClick(id, mentionEl.dataset.entityType)
          }
        }
        const wikiLinkEl = target.closest?.('[data-type="wiki-link"]') as HTMLElement | null
        if (wikiLinkEl && onWikiLinkClick) {
          const id = wikiLinkEl.dataset.id
          if (id) {
            e.preventDefault()
            e.stopPropagation()
            onWikiLinkClick(id)
          }
        }
      }}
    >
      <BubbleMenu editor={editor} className="flex gap-0.5 rounded-md border border-line bg-paper/90 backdrop-blur-sm p-1 shadow-none ring-1 ring-black/5">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${editor.isActive('bold') ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-paper-card hover:text-ink'}`}>
          <Bold size={16} strokeWidth={2} />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${editor.isActive('italic') ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-paper-card hover:text-ink'}`}>
          <Italic size={16} strokeWidth={2} />
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${editor.isActive('underline') ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-paper-card hover:text-ink'}`}>
          <UnderlineIcon size={16} strokeWidth={2} />
        </button>
        <button onClick={() => { editor.chain().focus().insertContent('@').run() }} className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${editor.isActive('mention') ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-paper-card hover:text-ink'}`} title="@ 引用">
          <AtSign size={16} strokeWidth={2} />
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
      <BlockTypeMenu editor={editor} position={blockMenuPosition} onClose={closeBlockMenu} blockPos={blockMenuPos} />
    </div>
    </ContextMenu>
  )
}
