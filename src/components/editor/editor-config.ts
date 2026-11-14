'use client'

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
import { getSchema, type Editor } from '@tiptap/core'
import type { UseEditorOptions } from '@tiptap/react'
import { searchReferableEntities } from '@/lib/reference-registry'
import { openExternal } from '@/lib/open-external'
import { safeHref } from '@/lib/safe-href'
import { ImageBlock } from './extensions/ImageBlock'
import { SmallMark } from './extensions/SmallMark'
import { FirstLineIndent } from './extensions/FirstLineIndent'
import { SlashCommand } from './SlashCommandMenu'
import { createWikiLinkExtension } from './WikiLinkExtension'
import { createMentionRender, type ExtendedReferableEntity } from './mention-render'
import { plainTextToPastedHtml, sanitizePastedHtml } from './paste'
import { runAsSingleUndoStep } from './undo-grouping'
import { editorContentOf } from './editor-content'

/** 拖拽把手 → 块类型菜单的自定义事件名（dispatch 在本模块的 DragHandle render 里，监听在 EditorCore） */
export const BLOCK_MENU_EVENT = 'editor-block-menu'

/** 入参全部来自 EditorCore 的 props / state / refs —— 本模块不读组件作用域 */
export interface BuildEditorConfigArgs {
  placeholder?: string
  plain?: boolean
  content?: string | object
  isMobile: boolean
  editorId: string
  /** 惰性读取当前编辑器（配置模块不持有 ref，只在事件处理器里调用） */
  getEditor: () => Editor | null
  /** 惰性读取软键盘是否可见 */
  isKeyboardVisible: () => boolean
  /** 编辑器实例就绪时回写（onCreate） */
  setEditor: (editor: Editor) => void
  setActiveEditor: (editor: Editor) => void
  onReady: (editor: Editor) => void
  onCharacterCount?: (count: number) => void
  onContentChange?: (content: string) => void
}

/**
 * 构建 TipTap 编辑器配置。
 *
 * 抽出来的原因：这是一个约 160 行的对象字面量（extensions 数组 + mention 的 suggestion
 * 配置 + editorProps + onCreate/onUpdate），留在组件里会把「组装」这件事淹没。
 * 保持纯函数语义：给定入参即返回配置对象，不读组件作用域、不产生副作用。
 */
export function buildEditorConfig({
  placeholder,
  plain,
  content,
  isMobile,
  editorId,
  getEditor,
  isKeyboardVisible,
  setEditor,
  setActiveEditor,
  onReady,
  onCharacterCount,
  onContentChange,
}: BuildEditorConfigArgs): UseEditorOptions {
  const config: UseEditorOptions = {
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // 4 级而非常见的 1–3：导入的 vault 里实测有 21 个 H4，
        // 不放进 schema 就会被丢弃。5/6 级由 markdown 桥降级到 4 级。
        heading: { levels: [1, 2, 3, 4] },
        paragraph: false,
        blockquote: {
          HTMLAttributes: { class: 'border-l-2 border-line pl-4 bg-paper-alt rounded-r-item italic text-ink-muted my-3 py-1' },
        },
        // 链接由我们自己的浮层编辑；点击交给 handleClick 走系统浏览器，
        // 不能让 WebView 自己导航（Tauri 里 target="_blank" 是死的）。
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          // 粘贴/自动链接也走同一套 URL 白名单（javascript:/data: 等直接丢）
          isAllowedUri: (url) => safeHref(url) !== '',
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
      Table.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            // 表格分隔行的原文（`|------|-----|` 这类紧凑写法）。
            // ProseMirror 的 fromJSON 只保留扩展 spec 里**声明过**的 attrs，
            // 不在这里声明就会被丢掉，序列化时只能退回 `| --- |` 规范形式，
            // 等于改掉用户这些文件的排版。分隔行不产生 token，解析时按行号回源码取。
            rawSeparator: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-raw-separator'),
              renderHTML: (attributes) =>
                attributes.rawSeparator ? { 'data-raw-separator': attributes.rawSeparator } : {},
            },
          }
        },
      }).configure({
        resizable: true,
        HTMLAttributes: { class: 'w-full border-collapse rounded-item overflow-hidden' },
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
      SmallMark,
      // Tab = 段首缩进两个全角空格（中文排版）。列表 / 表格 / 代码块里让路给它们自己的 Tab
      FirstLineIndent,
      SlashCommand,
      createWikiLinkExtension(),
      ...(isMobile ? [] : [
        DragHandle.configure({
        render: () => {
          const handle = document.createElement('div')
          handle.className = 'flex h-5 w-5 items-center justify-center cursor-grab rounded-item text-ink-faint opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100'
          handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="10" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/><circle cx="10" cy="10" r="1"/></svg>`
          handle.title = '拖拽排序'
          handle.dataset.blockHandle = 'true'
          handle.addEventListener('click', (e) => {
            e.stopPropagation()
            const ed = getEditor()
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
            // vault 的 [[ ]] 里可能带锚点或别名。
            // 节点只按 id 定位，原文另存一份，写回磁盘时才能逐字还原。
            raw: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-raw'),
              renderHTML: (attributes) => (attributes.raw ? { 'data-raw': attributes.raw } : {}),
            },
            anchor: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-anchor'),
              renderHTML: (attributes) => (attributes.anchor ? { 'data-anchor': attributes.anchor } : {}),
            },
          }
        },
      }).configure({
        HTMLAttributes: {
          class: 'inline-flex bg-paper-alt border border-line rounded-item px-1.5 text-sm text-ink cursor-pointer',
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
            ...(node.attrs.raw ? { 'data-raw': node.attrs.raw as string } : {}),
            ...(node.attrs.anchor ? { 'data-anchor': node.attrs.anchor as string } : {}),
          }, `@${label}`]
        },
        suggestion: {
          char: '@',
          items: async ({ query }) => {
            // 类型过滤在注册表内完成；先截断再按类型挑选，会让事件与国家在角色众多时整体缺失
            const entities = await searchReferableEntities(query, {
              types: ['character', 'event', 'country'],
            })
            return entities.map((e) => ({ ...e, label: e.name }))
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
      // 粘贴清洗：OC schema 已经只保留 Markdown 能表达的结构；这里再挡掉
      // script/style/iframe、on* 事件与不安全链接（javascript:/data: 等），
      // 同时拆掉无意义 span / 内联样式、保留标题 / 列表 / 表格 / 链接 / 图片。
      transformPastedHTML: (html) => sanitizePastedHtml(html),
      /**
       * 纯文本粘贴：像 Markdown 就转成结构，多段就拆段。
       *
       * 有 text/html 时不动手 —— 富文本自己带结构，交给 ProseMirror；
       * 只有纯文本、且不是图片文件时，才走 Markdown / 段落这条线。
       */
      handlePaste: (_view, event) => {
        const data = event.clipboardData
        if (!data) return false
        if (data.getData('text/html').trim() !== '') return false
        const text = data.getData('text/plain')
        const html = plainTextToPastedHtml(text)
        if (html === null) return false
        const editor = getEditor()
        if (!editor) return false
        event.preventDefault()
        // 一次粘贴算一步：撤销时整段粘贴一起退，不与前后输入粘连
        runAsSingleUndoStep(editor, () => {
          editor.chain().focus().insertContent(html).run()
        })
        return true
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        const anchor = target.closest('a')
        if (!anchor) return false
        const href = anchor.getAttribute('href')
        if (!href) return false
        if (/^https?:\/\//i.test(href)) {
          void openExternal(href)
          return true
        }
        if (/^(mailto|tel):/i.test(href)) {
          window.location.href = href
          return true
        }
        return false
      },
      /**
       * Esc = 交出正文焦点。
       *
       * Tab 现在是「段首缩进」（`FirstLineIndent`），键盘用户因此**没有键可以离开正文**
       * —— WCAG 2.1.2 明确禁止键盘陷阱。这里给一条出路：Esc 把焦点从正文里放出来，
       * 再按 Tab 就能在界面里走。
       *
       * 有浮层开着时不动手：菜单 / 弹窗 / 输入法候选 / 编辑器自己的浮层（链接、slash、@）
       * 都各自处理 Esc，抢在前面会把「关浮层」变成「连焦点一起丢」。
       */
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return false
        if (typeof document === 'undefined') return false
        const overlay = document.getElementById('overlay-root')
        if (overlay !== null && overlay.childElementCount > 0) return false
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        target.blur()
        return true
      },
      handleScrollToSelection: () => {
        if (!isMobile) return false
        if (!isKeyboardVisible()) return true
        const ed = getEditor()
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
      setEditor(readyEditor as Editor)
      setActiveEditor(readyEditor as Editor)
      onReady(readyEditor as Editor)
      onCharacterCount?.(readyEditor.getText().length)
      // 注意：不在 onCreate 调用 onContentChange——否则编辑器一挂载就触发"未保存"误报
    },
    onUpdate({ editor: updatedEditor }) {
      onCharacterCount?.(updatedEditor.getText().length)
      onContentChange?.(updatedEditor.getHTML())
    },
  }
  config.content = editorContentOf(content, () => getSchema(config.extensions ?? []))
  return config
}



