'use client'

import { useEffect, useState } from 'react'
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
  ChevronDown,
  Search,
  ListTree,
  IndentIncrease,
  IndentDecrease,
} from 'lucide-react'
import { ICON_BTN_MD, ROUND_CONTROL } from '@/lib/ui-tokens'
import { OverflowBar, type OverflowEntry } from '@/components/shared/OverflowBar'
import { LinkPopover } from './LinkPopover'
import { ToolbarMenu, type ToolbarMenuGroup, type ToolbarMenuItem } from './ToolbarMenu'
import { requestFind, requestOutline } from './editor-events'

type MenuKind = 'block' | 'list'

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
      className={`${ICON_BTN_MD} shrink-0 disabled:opacity-30 ${active ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
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
      title={label}
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => onClick(e.currentTarget)}
      className={`flex h-8 shrink-0 items-center gap-0.5 px-1.5 transition-colors ${ROUND_CONTROL} ${
        active
          ? 'bg-[var(--oc-hover)] text-ink'
          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
      }`}
    >
      {icon}
      <ChevronDown size={12} strokeWidth={2} className="text-ink-faint" />
    </button>
  )
}

/** 组间留白（原来是一个 `w-1` 的 span，跟着所属条目一起收口） */
function Gap() {
  return <span className="w-1" />
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
 * 只挂 Markdown 桥能表达的节点与标记；颜色 / 字体 / 对齐不在这里。
 *
 * **宽度由 `OverflowBar` 量容器决定**，不按窗口宽度切档：这一栏长在编辑器面板里，
 * 三分栏或侧栏展开时同一块屏幕只剩四五百像素，按窗口切档会让图标挤成一堆、
 * 压到右边的保存按钮上。放不下的条目收进「…」（`表格 / 分割线 / 查找 / 大纲` 本来就在那里）。
 */
export function EditorToolbar({
  editor,
  sticky = true,
  embedded = false,
}: {
  editor: Editor
  sticky?: boolean
  embedded?: boolean
}) {
  const [menu, setMenu] = useState<{ kind: MenuKind; anchor: HTMLButtonElement } | null>(null)
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null | undefined>(undefined)

  /**
   * 光标离开正文时整栏灰掉：标题输入框、国家下拉、相册搜索里都不该看起来像能改格式。
   * 菜单 / 链接浮层开着时不灰 —— 那时编辑器失焦是正常的（浮层里有输入框）。
   */
  const [focused, setFocused] = useState(editor.isFocused)
  useEffect(() => {
    const dom = editor.view.dom
    const sync = () => setFocused(dom.contains(document.activeElement))
    // 挂在 document 上而不是编辑器节点：编辑器自己的 focus 事件在部分
    // WebView / 程序化 focus 下不触发，导致整栏一直灰着（2026-11-14 实测）。
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', sync)
    sync()
    return () => {
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', sync)
    }
  }, [editor])
  const dimmed = !focused && menu === null && linkAnchor === undefined

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

  const boldItem: ToolbarMenuItem = {
    label: '粗体',
    icon: <Bold size={14} strokeWidth={2} />,
    active: state.bold,
    onClick: () => chain().toggleBold().run(),
    shortcut: 'Ctrl+B',
  }

  const italicItem: ToolbarMenuItem = {
    label: '斜体',
    icon: <Italic size={14} strokeWidth={2} />,
    active: state.italic,
    onClick: () => chain().toggleItalic().run(),
    shortcut: 'Ctrl+I',
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

  const undoItem: ToolbarMenuItem = {
    label: '撤销',
    icon: <Undo2 size={14} strokeWidth={2} />,
    onClick: () => chain().undo().run(),
    shortcut: 'Ctrl+Z',
  }

  const redoItem: ToolbarMenuItem = {
    label: '重做',
    icon: <Redo2 size={14} strokeWidth={2} />,
    onClick: () => chain().redo().run(),
    shortcut: 'Ctrl+Shift+Z',
  }

  const indentItem: ToolbarMenuItem = {
    label: '首行缩进',
    icon: <IndentIncrease size={14} strokeWidth={2} />,
    shortcut: 'Tab',
    onClick: () => chain().indentFirstLine().run(),
  }

  const outdentItem: ToolbarMenuItem = {
    label: '取消首行缩进',
    icon: <IndentDecrease size={14} strokeWidth={2} />,
    shortcut: 'Shift+Tab',
    onClick: () => chain().outdentFirstLine().run(),
  }

  const blockGroups: ToolbarMenuGroup[] = [
    { items: [paragraphItem, headingItem(1), headingItem(2), headingItem(3), headingItem(4), quoteItem, codeBlockItem] },
  ]

  const listGroups: ToolbarMenuGroup[] = [
    { items: [bulletItem, orderedItem, taskItem] },
  ]

  /** 一直留在「…」里的：Markdown 桥能表达、但不值得占栏的东西 */
  const permanentGroups: ToolbarMenuGroup[] = [
    { label: '文本格式', items: [strikeItem, codeItem, indentItem, outdentItem] },
    { label: '插入', items: [tableItem, hrItem] },
    { label: '编辑', items: [findItem, outlineItem] },
  ]

  const entries: OverflowEntry[] = [
    {
      key: 'undo',
      node: (
        <IconButton label="撤销" disabled={!state.canUndo} onActivate={() => chain().undo().run()}>
          <Undo2 size={16} strokeWidth={2} />
        </IconButton>
      ),
      menu: [{ label: '编辑', items: [undoItem] }],
    },
    {
      key: 'redo',
      node: (
        <IconButton label="重做" disabled={!state.canRedo} onActivate={() => chain().redo().run()}>
          <Redo2 size={16} strokeWidth={2} />
        </IconButton>
      ),
      menu: [{ label: '编辑', items: [redoItem] }],
    },
    {
      key: 'bold',
      node: (
        <>
          <Gap />
          <IconButton label="粗体" active={state.bold} onActivate={() => chain().toggleBold().run()}>
            <Bold size={16} strokeWidth={2} />
          </IconButton>
        </>
      ),
      menu: [{ label: '文本格式', items: [boldItem] }],
    },
    {
      key: 'italic',
      node: (
        <IconButton label="斜体" active={state.italic} onActivate={() => chain().toggleItalic().run()}>
          <Italic size={16} strokeWidth={2} />
        </IconButton>
      ),
      menu: [{ label: '文本格式', items: [italicItem] }],
    },
    {
      key: 'code',
      node: (
        <IconButton label="行内代码" active={state.code} onActivate={() => chain().toggleCode().run()}>
          <Code size={16} strokeWidth={2} />
        </IconButton>
      ),
      menu: [{ label: '文本格式', items: [codeItem] }],
    },
    {
      key: 'block',
      node: (
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
      ),
      menu: [{ label: '块格式', items: blockGroups[0].items }],
    },
    {
      key: 'list',
      node: (
        <ToolbarTrigger
          label="列表"
          icon={<List size={14} strokeWidth={2} />}
          active={state.bullet || state.ordered || state.task}
          onClick={(anchor) => setMenu({ kind: 'list', anchor })}
        />
      ),
      menu: [{ label: '列表', items: listGroups[0].items }],
    },
    {
      key: 'link',
      node: (
        <>
          <Gap />
          <IconButton label="链接" active={state.link} onActivate={(anchor) => setLinkAnchor(anchor)}>
            <LinkIcon size={16} strokeWidth={2} />
          </IconButton>
        </>
      ),
      menu: [{ label: '插入', items: [linkItem] }],
    },
    {
      key: 'image',
      node: (
        <IconButton label="图片" onActivate={() => chain().insertContent({ type: 'imageBlock' }).run()}>
          <ImageIcon size={16} strokeWidth={2} />
        </IconButton>
      ),
      menu: [{ label: '插入', items: [imageItem] }],
    },
  ]

  return (
    <>
      <div
        role="toolbar"
        aria-label="格式工具"
        className={
          (embedded
            ? 'flex h-full w-full items-center justify-center'
            : `flex items-center px-2 max-md:hidden ${sticky ? 'sticky top-12' : ''} z-10 h-10 border-b border-line bg-paper/85 backdrop-blur-lg`) +
          ` transition-opacity duration-fast ${dimmed ? 'opacity-40' : ''}`
        }
      >
        <OverflowBar
          entries={entries}
          menuGroups={permanentGroups}
          gap={2}
          className={embedded ? 'h-full w-full justify-center' : 'h-full w-full'}
          moreTitle="更多格式"
        />
      </div>

      {menu ? (
        <ToolbarMenu
          anchor={menu.anchor}
          groups={menu.kind === 'block' ? blockGroups : listGroups}
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
