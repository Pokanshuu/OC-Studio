'use client'

import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react'
import { tauriReadClipboard } from '@/lib/tauri-clipboard'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
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
import type { Editor } from '@tiptap/core'
import { Bold, Italic, Underline as UnderlineIcon, AtSign, Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Scissors, Image, Table as TableIcon, ChevronDown, Link2, Undo2, Redo2 } from 'lucide-react'
import React from 'react'
import { ImageBlock } from './extensions/ImageBlock'

import { BlockTypeMenu } from './BlockTypeMenu'
import { SlashCommand } from './SlashCommandMenu'
import { WikiLinkExtension } from './WikiLinkExtension'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { adjustSuggestionPosition } from '@/lib/menu-utils'
import type { ReferableEntity } from '@/lib/reference-registry'
import { getImageUrl, getDefaultImage } from '@/lib/image-service'
import { useDevice } from '@/lib/use-device'
import { useActiveEditor } from '@/lib/editor-context'
import { useKeyboard } from '@/lib/KeyboardContext'
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

function createMentionRender() {
  let popup: HTMLElement | null = null
  let ac: AbortController | null = null
  let selectedIndex = 0
  let currentItems: ReferableEntity[] = []
  let currentCommand: ((item: ReferableEntity) => void) | null = null

  const isComposing = (editor: Editor): boolean => {
    return (editor as unknown as { view: { composing: boolean } }).view?.composing ?? false
  }

  return () => ({
    onStart: (props: SuggestionProps<ReferableEntity>) => {
      if (!props.clientRect || props.items.length === 0) return
      if (isComposing(props.editor)) return
      ac?.abort()
      ac = new AbortController()
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = 0
      popup = document.createElement('div')
      popup.className = 'absolute z-50 max-h-56 overflow-auto rounded-md border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 min-w-[200px]'
      const rect = props.clientRect()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      renderMentionGroups(popup, props.items, props.command, 0)
      document.body.appendChild(popup)
      document.addEventListener('pointerdown', (e) => {
        if (popup && !popup.contains(e.target as Node)) {
          popup.remove()
          popup = null
          ac?.abort()
        }
      }, { signal: ac.signal, capture: true })
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
      if (!popup || props.items.length === 0) { popup?.remove(); popup = null; ac?.abort(); return }
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = Math.min(selectedIndex, props.items.length - 1)
      const rect = props.clientRect?.()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      popup.innerHTML = ''
      renderMentionGroups(popup, props.items, props.command, selectedIndex)
      if (rect) {
        const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
        popup.style.left = `${adjusted.x}px`
        popup.style.top = `${adjusted.y}px`
      }
    },
    onExit: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      ac?.abort()
      ac = null
      popup?.remove()
      popup = null
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') { popup?.remove(); popup = null; ac?.abort(); return true }
      if (props.event.key === 'ArrowDown') {
        selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
        if (popup) {
          popup.innerHTML = ''
          renderMentionGroups(popup, currentItems, currentCommand!, selectedIndex)
        }
        return true
      }
      if (props.event.key === 'ArrowUp') {
        selectedIndex = Math.max(selectedIndex - 1, 0)
        if (popup) {
          popup.innerHTML = ''
          renderMentionGroups(popup, currentItems, currentCommand!, selectedIndex)
        }
        return true
      }
      if (props.event.key === 'Enter') {
        const item = currentItems[selectedIndex]
        if (item && currentCommand) {
          currentCommand(item)
          return true
        }
      }
      return false
    },
  })
}

function renderMentionGroups(
  container: HTMLElement,
  items: ReferableEntity[],
  command: (item: ReferableEntity) => void,
  selectedIndex = -1,
) {
  let globalIdx = 0
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
      const isSelected = globalIdx === selectedIndex
      globalIdx++
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${isSelected ? 'bg-black/5 dark:bg-white/5 text-ink' : 'text-ink'}`

      if (item.type === 'character' || item.type === 'country') {
        const avatarType = item.type === 'country' ? 'flag' : 'avatar'
        const img = document.createElement('img')
        img.src = getImageUrl(item.avatarUrl, avatarType)
        img.alt = ''
        img.className = 'w-5 h-5 rounded-full object-cover shrink-0 border border-line'
        img.onerror = () => { img.src = getDefaultImage(avatarType) }
        btn.appendChild(img)
      }

      const nameSpan = document.createElement('span')
      nameSpan.className = 'truncate'
      nameSpan.textContent = item.name
      btn.appendChild(nameSpan)

      const typeSpan = document.createElement('span')
      typeSpan.className = 'ml-auto shrink-0 text-xs text-ink-faint'
      typeSpan.textContent = ENTITY_TYPE_LABELS[item.type] ?? item.type
      btn.appendChild(typeSpan)

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

function BubbleMenuButtons({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      mention: e.isActive('mention'),
    }),
  })

  const base = 'flex h-8 w-8 items-center justify-center rounded transition-colors'
  const active = 'bg-black/10 dark:bg-white/10 text-ink'
  const inactive = 'text-ink-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-ink'

  return (
    <>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} className={`${base} ${state.bold ? active : inactive}`}>
        <Bold size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} className={`${base} ${state.italic ? active : inactive}`}>
        <Italic size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} className={`${base} ${state.underline ? active : inactive}`}>
        <UnderlineIcon size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' @').run() }} className={`${base} ${state.mention ? active : inactive}`} title="@ 引用">
        <AtSign size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' [[').run() }} className={`${base} ${inactive}`} title="[[ 内链">
        <Link2 size={16} strokeWidth={2} />
      </button>
    </>
  )
}

export function EditorCore({
  onReady, onCharacterCount, onContentChange, content, placeholder, onMentionClick, onWikiLinkClick, plain,
}: EditorCoreProps) {
  const editorId = useId()
  const [blockMenuPosition, setBlockMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [blockMenuPos, setBlockMenuPos] = useState<number | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [isTableActive, setIsTableActive] = useState(false)
  const [toolbarTick, setToolbarTick] = useState(0)
  const { isMobile } = useDevice()
  const { setActiveEditor } = useActiveEditor()
  const { visible: keyboardVisible, viewportHeight: keyboardHeight } = useKeyboard()
  const [mobileBlockMenuOpen, setMobileBlockMenuOpen] = useState(false)
  const selectionRef = useRef<{ from: number; to: number } | null>(null)
  const isPointerDownRef = useRef(false)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const keyboardVisibleRef = useRef(keyboardVisible)
  keyboardVisibleRef.current = keyboardVisible
  const lastClickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = editorRef.current?.view.dom
      if (el && el.contains(e.target as Node)) {
        isPointerDownRef.current = true
      }
    }
    const up = () => {
      const wasDown = isPointerDownRef.current
      isPointerDownRef.current = false
      if (wasDown) {
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      }
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
    }
  }, [])

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
      ImageBlock,
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
      handleScrollToSelection: () => {
        if (!isMobile) return false
        if (!keyboardVisibleRef.current) return true
        const ed = editorRef.current
        if (!ed) return true
        const { selection } = ed.state
        if (selection.empty) {
          const coords = ed.view.coordsAtPos(selection.head)
          const toolbarH = 56
          const vvBottom = document.documentElement.clientHeight
          const overflow = coords.bottom + toolbarH - vvBottom
          if (overflow > 0) {
            const scroller = ed.view.dom.closest('.section-fade') as HTMLElement | null
            if (scroller) scroller.scrollTop += overflow
          }
        }
        return true
      },
      attributes: {
        class: plain
          ? 'tiptap max-w-none pl-0 pr-0 py-0 text-[15px] leading-relaxed focus:outline-none min-h-[2em]'
          : 'tiptap max-w-none pl-8 pr-4 py-2 text-[15px] leading-relaxed focus:outline-none min-h-[2em]',
        ...(isMobile ? { /* virtualkeyboardpolicy removed — system handles keyboard natively */ } : {}),
      },
    },
    content: content ?? '',
    onCreate({ editor: readyEditor }) {
      editorRef.current = readyEditor as Editor
      setActiveEditor(readyEditor as Editor)
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

  useEffect(() => {
    if (!editor) return
    const handleFocus = () => setActiveEditor(editor)
    editor.on('focus', handleFocus)
    return () => { editor.off('focus', handleFocus) }
  }, [editor, setActiveEditor])

  // 桌面端 BubbleMenu：聚焦/失焦时主动触发显示/隐藏
  useEffect(() => {
    if (!editor || isMobile) return
    const onFocus = () => {
      requestAnimationFrame(() => {
        const ed = editorRef.current
        if (ed && !ed.isDestroyed && ed.isFocused) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      })
    }
    const onBlur = () => {
      const ed = editorRef.current
      if (ed && !ed.isDestroyed) {
        ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'hide'))
      }
    }
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
    }
  }, [editor, isMobile])

  // 桌面端 BubbleMenu：输入时隐藏，停止输入 200ms 后显示
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onKeyDown = () => {
      isTypingRef.current = true
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false
        const ed = editorRef.current
        if (ed && !ed.isDestroyed && ed.isFocused) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      }, 200)
    }
    dom.addEventListener('keydown', onKeyDown)
    return () => {
      dom.removeEventListener('keydown', onKeyDown)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [editor])

  useEffect(() => {
    if (!isMobile || !editor) return
    const dom = editor.view.dom
    let timer: ReturnType<typeof setTimeout> | null = null
    let startPos: { x: number; y: number } | null = null
    let wasLongPress = false
    let wasScroll = false

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startPos = { x: touch.clientX, y: touch.clientY }
      wasLongPress = false
      wasScroll = false
      timer = setTimeout(() => {
        wasLongPress = true
      }, 320)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!startPos) return
      const touch = e.touches[0]
      if (Math.abs(touch.clientX - startPos.x) > 8 || Math.abs(touch.clientY - startPos.y) > 8) {
        if (timer) { clearTimeout(timer); timer = null }
        wasScroll = true
      }
    }

    const onTouchEnd = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (wasScroll || wasLongPress) {
        startPos = null
        return
      }
      editor.commands.focus()
      startPos = null
    }

    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchmove', onTouchMove, { passive: true })
    dom.addEventListener('touchend', onTouchEnd)
    dom.addEventListener('touchcancel', onTouchEnd)
    return () => {
      dom.removeEventListener('touchstart', onTouchStart)
      dom.removeEventListener('touchmove', onTouchMove)
      dom.removeEventListener('touchend', onTouchEnd)
      dom.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isMobile, editor])

  // 移动端工具栏自定义事件（MobileTextSelectionBar → EditorCore）
  useEffect(() => {
    if (!isMobile || !editor) return
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
  }, [isMobile, editor])

  // 移动端键盘弹出后检查光标是否被遮挡并滚动到位
  useEffect(() => {
    if (!isMobile || !keyboardVisible) return
    const ed = editorRef.current
    if (!ed || !ed.isFocused) return
    const id = setTimeout(() => {
      if (!editorRef.current) return
      const coords = editorRef.current.view.coordsAtPos(editorRef.current.state.selection.head)
      const toolbarH = 56
      const vvBottom = document.documentElement.clientHeight
      const overflow = coords.bottom + toolbarH - vvBottom
      if (overflow > 0) {
        const scroller = editorRef.current.view.dom.closest('.section-fade') as HTMLElement | null
        if (scroller) scroller.scrollTop += overflow
      }
    }, 30)
    return () => clearTimeout(id)
  }, [isMobile, keyboardVisible])

  // 移动端：缓存最近一次文本选择，防止工具栏按钮点击时丢失选择
  useEffect(() => {
    if (!editor || !isMobile) return
    const handle = () => {
      const { from, to } = editor.state.selection
      if (from !== to) {
        selectionRef.current = { from, to }
      } else {
        selectionRef.current = null
      }
    }
    editor.on('selectionUpdate', handle)
    return () => { editor.off('selectionUpdate', handle) }
  }, [editor, isMobile])

  // 移动端工具栏按钮：先恢复选择再执行操作
  const handleToolbarAction = useCallback((action: () => void) => {
    if (!editor) return
    if (isMobile && selectionRef.current) {
      const { from, to } = selectionRef.current
      editor.chain().setTextSelection({ from, to }).run()
    }
    editor.commands.focus()
    action()
    setToolbarTick(v => v + 1)
  }, [isMobile, editor])

  // 移动端工具栏统一 onPointerDown 入口：preventDefault + stopPropagation + 执行命令
  const handleToolbarPointerDown = useCallback((e: React.PointerEvent, action: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    handleToolbarAction(action)
  }, [handleToolbarAction])

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
      onMouseDown={(e) => {
        lastClickRef.current = { x: e.clientX, y: e.clientY }
      }}
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
      {!isMobile && (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          shouldShow={({ editor }) => {
            return editor.isFocused && !isTypingRef.current
          }}
          getReferencedVirtualElement={() => {
            const { selection } = editor.state
            if (!selection.empty) {
              const domSel = window.getSelection()
              if (domSel && domSel.rangeCount > 0) {
                const rect = domSel.getRangeAt(0).getBoundingClientRect()
                if (rect.width > 0 || rect.height > 0) return { getBoundingClientRect: () => rect }
              }
              return null
            }
            const { x: clickX, y: clickY } = lastClickRef.current
            const domSel = window.getSelection()
            const el = domSel?.focusNode instanceof Text
              ? domSel.focusNode.parentElement
              : domSel?.focusNode as HTMLElement | null
            const lineHeight = el
              ? parseFloat(getComputedStyle(el).lineHeight) || 24
              : 24
            return {
              getBoundingClientRect: () => new DOMRect(
                clickX,
                clickY - lineHeight / 2,
                1,
                lineHeight,
              ),
            }
          }}
          className="flex gap-0.5 rounded-md border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 z-20 context-menu-fade context-menu-visible"
        >
          <BubbleMenuButtons editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {!isMobile && (
        <BlockTypeMenu editor={editor} position={blockMenuPosition} onClose={closeBlockMenu} blockPos={blockMenuPos} />
      )}
    </div>

    {/* 移动端键盘工具栏 */}
    {isMobile && keyboardVisible && editor?.isFocused && (
      <>
        {mobileBlockMenuOpen && (
          <div
            className="fixed inset-0 z-30"
            onPointerDown={() => setMobileBlockMenuOpen(false)}
          />
        )}
        <div
          className="fixed left-0 right-0 z-30 flex items-center gap-2 px-3 py-2 bg-paper/85 backdrop-blur-lg border-t border-line"
          style={{ bottom: `${keyboardHeight}px` }}
          data-tick={toolbarTick}
        >
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => {
              if (!editor) return
              editor.chain().focus().run()
              setMobileBlockMenuOpen(!mobileBlockMenuOpen)
            })}
            className="touch-feedback h-9 px-3 rounded flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-line text-sm text-ink shrink-0"
          >
            <Pilcrow size={14} strokeWidth={2} />
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleBold().run())}
            className={`touch-feedback h-9 w-9 flex items-center justify-center rounded border border-line shrink-0 ${editor?.isActive('bold') ? 'bg-black/15 dark:bg-white/30' : 'bg-black/5 dark:bg-white/5'}`}
          >
            <Bold size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleItalic().run())}
            className={`touch-feedback h-9 w-9 flex items-center justify-center rounded border border-line shrink-0 ${editor?.isActive('italic') ? 'bg-black/15 dark:bg-white/30' : 'bg-black/5 dark:bg-white/5'}`}
          >
            <Italic size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleUnderline().run())}
            className={`touch-feedback h-9 w-9 flex items-center justify-center rounded border border-line shrink-0 ${editor?.isActive('underline') ? 'bg-black/15 dark:bg-white/30' : 'bg-black/5 dark:bg-white/5'}`}
          >
            <UnderlineIcon size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().insertContent(' @').run())}
            className={`touch-feedback h-9 w-9 flex items-center justify-center rounded border border-line shrink-0 ${editor?.isActive('mention') ? 'bg-black/15 dark:bg-white/30' : 'bg-black/5 dark:bg-white/5'}`}
          >
            <AtSign size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().insertContent(' [[').run())}
            className="touch-feedback h-9 w-9 flex items-center justify-center rounded border border-line shrink-0 bg-black/5 dark:bg-white/5"
          >
            <Link2 size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().undo().run())}
            disabled={!editor?.can().undo()}
            className="h-9 w-9 flex items-center justify-center rounded shrink-0 ml-auto text-ink-muted active:bg-black/8 dark:active:bg-white/8 disabled:opacity-30"
          >
            <Undo2 size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().redo().run())}
            disabled={!editor?.can().redo()}
            className="h-9 w-9 flex items-center justify-center rounded shrink-0 text-ink-muted active:bg-black/8 dark:active:bg-white/8 disabled:opacity-30"
          >
            <Redo2 size={16} strokeWidth={2} />
          </button>
        </div>

        {/* 移动端块类型选择面板 */}
        {mobileBlockMenuOpen && (
          <div
            className="fixed left-0 right-0 z-40 p-3 bg-paper/85 backdrop-blur-lg border-t border-line"
            style={{ bottom: `${keyboardHeight + 44}px` }}
          >
            <div className="flex flex-wrap gap-2">
              {[
                { label: '段落', icon: <Pilcrow size={16} strokeWidth={2} />, action: () => editor?.chain().focus().setParagraph().run(), active: () => editor?.isActive('paragraph') ?? false },
                { label: 'H1', icon: <Heading1 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor?.isActive('heading', { level: 1 }) },
                { label: 'H2', icon: <Heading2 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive('heading', { level: 2 }) },
                { label: 'H3', icon: <Heading3 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor?.isActive('heading', { level: 3 }) },
                { label: '无序列表', icon: <List size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive('bulletList') ?? false },
                { label: '有序列表', icon: <ListOrdered size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive('orderedList') ?? false },
                { label: '任务列表', icon: <ListTodo size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleTaskList().run(), active: () => editor?.isActive('taskList') ?? false },
                { label: '引用', icon: <Quote size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleBlockquote().run(), active: () => editor?.isActive('blockquote') ?? false },
                { label: '分割线', icon: <Scissors size={16} strokeWidth={2} />, action: () => editor?.chain().focus().setHorizontalRule().run(), active: () => false },
                { label: '图片', icon: <Image size={16} strokeWidth={2} />, action: () => editor?.chain().focus().insertContent({ type: 'imageBlock' }).run(), active: () => false },
                { label: '表格', icon: <TableIcon size={16} strokeWidth={2} />, action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => false },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onPointerDown={(e) => handleToolbarPointerDown(e, () => { item.action(); setMobileBlockMenuOpen(false) })}
                  className={`touch-feedback flex items-center gap-1.5 rounded border border-line px-3 py-2 text-sm transition-colors ${item.active() ? 'bg-black/15 dark:bg-white/30 text-ink' : 'bg-black/5 dark:bg-white/5 text-ink-muted'}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )}
    </ContextMenu>
  )
}
