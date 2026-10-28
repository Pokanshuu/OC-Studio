'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Code2,
  Quote,
  List,
  ListOrdered,
  ListTodo,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Undo2,
  Redo2,
  MoreHorizontal,
  ChevronDown,
  Search,
  ListTree,
} from 'lucide-react'
import { ICON_BTN_MD, ROUND_CONTROL } from '@/lib/ui-tokens'
import { LinkPopover } from './LinkPopover'
import { ToolbarMenu, type ToolbarMenuGroup, type ToolbarMenuItem } from './ToolbarMenu'
import { requestFind, requestOutline } from './editor-events'

type MenuKind = 'block' | 'list' | 'more'

interface IconButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onActivate: (anchor: HTMLButtonElement) => void
  children: ReactNode
}

/** 28/32px 工具按钮。鼠标在 pointerdown 执行（保住选区），键盘走 click(detail=0)。 */
function IconButton({ label, active, disabled, onActivate, children }: IconButtonProps) {
  const fire = (el: HTMLButtonElement) => {
    if (!disabled) onActivate(el)
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        fire(e.currentTarget)
      }}
      onClick={(e) => {
        if (e.detail === 0) fire(e.currentTarget)
      }}
      className={`${ICON_BTN_MD} shrink-0 disabled:opacity-30 ${active ? 'bg-ink text-paper' : ''}`}
    >
      {children}
    </button>
  )
}

function ToolbarTrigger({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: (anchor: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-label={label}
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => onClick(e.currentTarget)}
      className={`flex h-8 shrink-0 items-center gap-1 px-1.5 text-[12px] transition-colors ${ROUND_CONTROL} ${
        active
          ? 'bg-[var(--oc-hover)] text-ink'
          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
      <ChevronDown size={12} strokeWidth={2} className="text-ink-faint" />
    </button>
  )
}

function headingIcon(level: number): ReactNode {
  if (level === 1) return <Heading1 size={14} strokeWidth={2} />
  if (level === 2) return <Heading2 size={14} strokeWidth={2} />
  if (level === 3) return <Heading3 size={14} strokeWidth={2} />
  if (level === 4) return <Heading4 size={14} strokeWidth={2} />
  return <Pilcrow size={14} strokeWidth={2} />
}

/**
 * 正文常驻格式栏（桌面；移动端仍走 MobileEditorToolbar）。
 *
 * 最小集 + 组级溢出：宽/中/窄按**工具栏容器宽度**切换，不按窗口宽度。
 * 只挂 Markdown 桥能表达的节点与标记；颜色/字体/对齐不在这里。
 */
export function EditorToolbar({ editor, sticky = true }: { editor: Editor; sticky?: boolean }) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [menu, setMenu] = useState<{ kind: MenuKind; anchor: HTMLButtonElement } | null>(null)
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null | undefined>(undefined)

  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const level = ([1, 2, 3, 4] as const).find((l) => e.isActive('heading', { level: l })) ?? 0
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        headingLevel: level,
        block: e.isActive('blockquote') ? '引用' : e.isActive('codeBlock') ? '代码块' : level ? `标题 ${level}` : '正文',
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        task: e.isActive('taskList'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })

  const wide = width >= 960
  const medium = width >= 640
  const show = {
    redo: medium,
    code: wide,
    heading: medium,
    list: medium,
    link: wide,
    image: wide,
  }

  const chain = () => editor.chain().focus()

  const paragraphItem: ToolbarMenuItem = {
    label: '正文',
    icon: <Pilcrow size={14} strokeWidth={2} />,
    active: state.block === '正文',
    onClick: () => chain().setParagraph().run(),
  }

  const headingItem = (level: 1 | 2 | 3 | 4): ToolbarMenuItem => ({
    label: `标题 ${level}`,
    icon: headingIcon(level),
    active: state.headingLevel === level,
    onClick: () => chain().setHeading({ level }).run(),
  })

  const bulletItem: ToolbarMenuItem = {
    label: '无序列表',
    icon: <List size={14} strokeWidth={2} />,
    active: state.bullet,
    onClick: () => chain().toggleBulletList().run(),
  }

  const orderedItem: ToolbarMenuItem = {
    label: '有序列表',
    icon: <ListOrdered size={14} strokeWidth={2} />,
    active: state.ordered,
    onClick: () => chain().toggleOrderedList().run(),
  }

  const taskItem: ToolbarMenuItem = {
    label: '任务列表',
    icon: <ListTodo size={14} strokeWidth={2} />,
    active: state.task,
    onClick: () => chain().toggleTaskList().run(),
  }

  const codeItem: ToolbarMenuItem = {
    label: '行内代码',
    icon: <Code size={14} strokeWidth={2} />,
    active: state.code,
    onClick: () => chain().toggleCode().run(),
  }

  const strikeItem: ToolbarMenuItem = {
    label: '删除线',
    icon: <Strikethrough size={14} strokeWidth={2} />,
    active: state.strike,
    onClick: () => chain().toggleStrike().run(),
  }

  const quoteItem: ToolbarMenuItem = {
    label: '引用',
    icon: <Quote size={14} strokeWidth={2} />,
    active: state.block === '引用',
    onClick: () => chain().toggleBlockquote().run(),
  }

  const codeBlockItem: ToolbarMenuItem = {
    label: '代码块',
    icon: <Code2 size={14} strokeWidth={2} />,
    active: state.block === '代码块',
    onClick: () => chain().toggleCodeBlock().run(),
  }

  const linkItem: ToolbarMenuItem = {
    label: '链接',
    icon: <LinkIcon size={14} strokeWidth={2} />,
    active: state.link,
    onClick: () => setLinkAnchor(null),
  }

  const imageItem: ToolbarMenuItem = {
    label: '图片',
    icon: <ImageIcon size={14} strokeWidth={2} />,
    onClick: () => chain().insertContent({ type: 'imageBlock' }).run(),
  }

  const tableItem: ToolbarMenuItem = {
    label: '表格',
    icon: <TableIcon size={14} strokeWidth={2} />,
    onClick: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  }

  const hrItem: ToolbarMenuItem = {
    label: '分割线',
    icon: <Minus size={14} strokeWidth={2} />,
    onClick: () => chain().setHorizontalRule().run(),
  }

  const findItem: ToolbarMenuItem = {
    label: '查找替换',
    icon: <Search size={14} strokeWidth={2} />,
    shortcut: 'Ctrl+F',
    onClick: () => requestFind(editor),
  }

  const outlineItem: ToolbarMenuItem = {
    label: '大纲',
    icon: <ListTree size={14} strokeWidth={2} />,
    shortcut: 'Ctrl+Shift+O',
    onClick: () => requestOutline(editor),
  }

  const redoItem: ToolbarMenuItem = {
    label: '重做',
    icon: <Redo2 size={14} strokeWidth={2} />,
    onClick: () => chain().redo().run(),
  }

  const blockGroups: ToolbarMenuGroup[] = [
    { items: [paragraphItem, headingItem(1), headingItem(2), headingItem(3)] },
  ]

  const listGroups: ToolbarMenuGroup[] = [
    { items: [bulletItem, orderedItem] },
  ]

  const moreGroups: ToolbarMenuGroup[] = []
  const textItems: ToolbarMenuItem[] = [strikeItem]
  if (!show.code) textItems.push(codeItem)
  moreGroups.push({ label: '文本格式', items: textItems })

  const blockItems: ToolbarMenuItem[] = []
  if (!show.heading) blockItems.push(paragraphItem, headingItem(1), headingItem(2), headingItem(3))
  blockItems.push(headingItem(4), quoteItem, codeBlockItem)
  moreGroups.push({ label: '块格式', items: blockItems })

  const listItems: ToolbarMenuItem[] = []
  if (!show.list) listItems.push(bulletItem, orderedItem)
  listItems.push(taskItem)
  moreGroups.push({ label: '列表', items: listItems })

  const insertItems: ToolbarMenuItem[] = []
  if (!show.link) insertItems.push(linkItem)
  if (!show.image) insertItems.push(imageItem)
  insertItems.push(tableItem, hrItem)
  moreGroups.push({ label: '插入', items: insertItems })

  const editItems: ToolbarMenuItem[] = [findItem, outlineItem]
  if (!show.redo) editItems.push(redoItem)
  moreGroups.push({ label: '编辑', items: editItems })

  return (
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="格式工具"
        className={`${sticky ? 'sticky top-12' : ''} z-10 flex h-10 items-center gap-0.5 border-b border-line bg-paper px-2 max-md:hidden`}
      >
        <IconButton
          label="撤销"
          disabled={!state.canUndo}
          onActivate={() => chain().undo().run()}
        >
          <Undo2 size={16} strokeWidth={2} />
        </IconButton>
        {show.redo ? (
          <IconButton
            label="重做"
            disabled={!state.canRedo}
            onActivate={() => chain().redo().run()}
          >
            <Redo2 size={16} strokeWidth={2} />
          </IconButton>
        ) : null}

        <span className="w-1" />
        <IconButton
          label="粗体"
          active={state.bold}
          onActivate={() => chain().toggleBold().run()}
        >
          <Bold size={16} strokeWidth={2} />
        </IconButton>
        <IconButton
          label="斜体"
          active={state.italic}
          onActivate={() => chain().toggleItalic().run()}
        >
          <Italic size={16} strokeWidth={2} />
        </IconButton>
        {show.code ? (
          <IconButton
            label="行内代码"
            active={state.code}
            onActivate={() => chain().toggleCode().run()}
          >
            <Code size={16} strokeWidth={2} />
          </IconButton>
        ) : null}

        {show.heading ? (
          <ToolbarTrigger
            label={state.block}
            icon={
              state.block === '引用'
                ? <Quote size={14} strokeWidth={2} />
                : state.block === '代码块'
                  ? <Code2 size={14} strokeWidth={2} />
                  : headingIcon(state.headingLevel)
            }
            active={state.headingLevel > 0}
            onClick={(anchor) => setMenu({ kind: 'block', anchor })}
          />
        ) : null}
        {show.list ? (
          <ToolbarTrigger
            label="列表"
            icon={<List size={14} strokeWidth={2} />}
            active={state.bullet || state.ordered || state.task}
            onClick={(anchor) => setMenu({ kind: 'list', anchor })}
          />
        ) : null}

        <span className="w-1" />
        {show.link ? (
          <IconButton
            label="链接"
            active={state.link}
            onActivate={(anchor) => setLinkAnchor(anchor)}
          >
            <LinkIcon size={16} strokeWidth={2} />
          </IconButton>
        ) : null}
        {show.image ? (
          <IconButton
            label="图片"
            onActivate={() => chain().insertContent({ type: 'imageBlock' }).run()}
          >
            <ImageIcon size={16} strokeWidth={2} />
          </IconButton>
        ) : null}

        <span className="grow" />
        <button
          type="button"
          title="更多"
          aria-label="更多"
          aria-haspopup="menu"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => setMenu({ kind: 'more', anchor: e.currentTarget })}
          className={`${ICON_BTN_MD} shrink-0`}
        >
          <MoreHorizontal size={16} strokeWidth={2} />
        </button>
      </div>

      {menu ? (
        <ToolbarMenu
          anchor={menu.anchor}
          groups={menu.kind === 'block' ? blockGroups : menu.kind === 'list' ? listGroups : moreGroups}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {linkAnchor !== undefined ? (
        <LinkPopover
          editor={editor}
          anchor={linkAnchor}
          onClose={() => setLinkAnchor(undefined)}
        />
      ) : null}
    </>
  )
}
