'use client'

import { Extension, type CommandProps } from '@tiptap/core'

/**
 * 首行缩进（中文排版）：Tab 缩进一级，Shift+Tab 退一级。
 *
 * **用两个全角空格 U+3000，不用 `text-indent`，也不用半角空格**：
 * - 磁盘上的正文是 Markdown，段首的 `text-indent` 无处可存，写回就丢；
 * - 半角空格（尤其 4 个）在 CommonMark 里会被判成代码块，2 个也会被解析器吃掉；
 * - U+3000 是普通文字，`md → tiptap → md` 逐字节稳定（`tmp/indent-probe.ts` 验过），
 *   Obsidian 打开也是「看得见的缩进」。
 *
 * 列表 / 表格 / 代码块里**不动手**：表格的 Tab 是跳到下一格、列表的 Tab 是降级，
 * 这里返回 false，让它们自己的绑定接手（不抢别人的键）。
 */

/** tiptap 没有从 core 导出 `Transaction`，从 CommandProps 上取同一个类型 */
type Transaction = CommandProps['tr']

/** 一级缩进 = 两个全角空格 */
export const FIRST_LINE_INDENT = '\u3000\u3000'

/** 段首可能出现的空白：全角空格、半角空格、制表符 */
const LEADING_WS = /^[\u3000 \t]+/
const LEADING_IDEOGRAPHIC = /^\u3000+/

/** 这些容器里的段落不参与首行缩进（Tab 另有含义，缩进也没有排版意义） */
const BLOCKED_ANCESTORS = new Set(['listItem', 'taskItem', 'tableCell', 'tableHeader', 'codeBlock'])

/** 只用到文本块的两三个方法，不把 prosemirror 的 Node 类型铺开 */
interface TextBlockNode {
  type: { name: string }
  content: { size: number }
  textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string
}

function isIndentableBlock(node: TextBlockNode): boolean {
  const name = node.type.name
  return name === 'paragraph' || name === 'heading'
}

/** 当前块外面有没有「Tab 另有含义」的容器 */
function hasBlockedAncestor(state: CommandProps['state'], pos: number): boolean {
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (BLOCKED_ANCESTORS.has($pos.node(depth).type.name)) return true
  }
  return false
}

interface BlockTarget {
  /** 段落内容的起始位置（块起点 + 1） */
  start: number
  /** 段首已有的空白 */
  leading: string
}

/** 这次要改的段落：空选区取光标所在块，有选区取范围内所有块 */
function collectTargets(state: CommandProps['state']): BlockTarget[] {
  const { from, to } = state.selection
  const targets: BlockTarget[] = []
  const seen = new Set<number>()

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isIndentableBlock(node)) return true
    const start = pos + 1
    if (seen.has(start)) return false
    if (hasBlockedAncestor(state, start)) return false
    seen.add(start)
    const text = node.textBetween(0, node.content.size, '', '')
    targets.push({ start, leading: LEADING_WS.exec(text)?.[0] ?? '' })
    return false
  })

  return targets
}

/**
 * 生成一次缩进 / 退格的事务；没有任何段落要改时返回 null。
 *
 * 段落从后往前改：先动后面的，前面段落的位置就不会被插入挤偏。
 */
function buildIndentTransaction(
  state: CommandProps['state'],
  direction: 'in' | 'out',
): Transaction | null {
  const targets = collectTargets(state)
  if (targets.length === 0) return null

  let tr = state.tr
  let changed = false

  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const { start, leading } = targets[i]
    if (direction === 'in') {
      // 已经是一级缩进就不再叠：Tab 按两次仍然是两个全角空格
      if (leading === FIRST_LINE_INDENT) continue
      if (leading.length > 0) {
        tr = tr.delete(start, start + leading.length)
        changed = true
      }
      tr = tr.insertText(FIRST_LINE_INDENT, start)
      changed = true
    } else {
      if (leading.length === 0) continue
      // 一次退一级：全角空格退两个（不足两个就退完），半角 / 制表符最多退两个字符
      const ideographic = LEADING_IDEOGRAPHIC.exec(leading)?.[0].length ?? 0
      const strip = ideographic > 0 ? Math.min(2, ideographic) : Math.min(2, leading.length)
      tr = tr.delete(start, start + strip)
      changed = true
    }
  }

  return changed ? tr : null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    firstLineIndent: {
      /** 段首缩进两个全角空格（中文排版的一级缩进） */
      indentFirstLine: () => ReturnType
      /** 取消段首缩进 */
      outdentFirstLine: () => ReturnType
    }
  }
}

/**
 * 光标 / 选区是否在「能首行缩进」的地方。
 *
 * 键盘绑定要靠它决定**要不要吃掉 Tab**：表格里 Tab 是跳下一格、列表里是降级，
 * 那两个扩展的绑定必须还有机会跑。以前无脑 return true，等于把表格的 Tab 吞了。
 */
export function canIndentFirstLine(state: CommandProps['state']): boolean {
  return collectTargets(state).length > 0
}

export const FirstLineIndent = Extension.create({
  name: 'firstLineIndent',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        // 列表 / 表格 / 代码块里放行：返回 false，后面的绑定（跳格 / 降级）照常工作
        if (!canIndentFirstLine(this.editor.state)) return false
        this.editor.commands.indentFirstLine()
        // 已经缩进过（命令没改动）也要吃掉 Tab，否则焦点会跳出编辑器
        return true
      },
      'Shift-Tab': () => {
        if (!canIndentFirstLine(this.editor.state)) return false
        this.editor.commands.outdentFirstLine()
        return true
      },
    }
  },

  addCommands() {
    const run =
      (direction: 'in' | 'out') =>
      ({ state, dispatch }: CommandProps) => {
        const tr = buildIndentTransaction(state, direction)
        if (tr === null) return false
        if (dispatch) dispatch(tr)
        return true
      }

    return {
      indentFirstLine: () => run('in'),
      outdentFirstLine: () => run('out'),
    }
  },
})
