import type { Editor } from '@tiptap/core'

/**
 * 查找替换的纯函数层（移植自 Simple_Office 的 `lib/findReplace.ts`）。
 *
 * 三条硬规则：
 * - 每次操作都按**当前文档**重算匹配，只存位置，不缓存过期索引；
 * - 替换一处保留被替换处的 marks（加粗/链接等）；
 * - 全部替换是**一个事务**，一次 Ctrl+Z 就能撤销。
 */

export interface FindMatch {
  from: number
  to: number
}

type EditorDoc = Editor['state']['doc']

export function findMatches(doc: EditorDoc, query: string, caseSensitive: boolean): FindMatch[] {
  const matches: FindMatch[] = []
  if (!query) return matches

  const needle = caseSensitive ? query : query.toLowerCase()

  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const text = node.text ?? ''
    const haystack = caseSensitive ? text : text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = haystack.indexOf(needle, index + needle.length)
    }
    return true
  })

  return matches
}

export function nextMatchIndex(matches: FindMatch[], fromPos: number): number {
  if (!matches.length) return -1
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].from >= fromPos) return i
  }
  return 0
}

export function selectMatch(editor: Editor, match: FindMatch): void {
  editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run()
  editor.commands.scrollIntoView()
}

/** 替换一处，保留原来的字符样式；返回是否成功。 */
export function replaceMatch(editor: Editor, match: FindMatch, replacement: string): boolean {
  if (!match) return false

  const marks = editor.state.doc.resolve(match.from).marks()
  const tr = editor.state.tr.insertText(replacement, match.from, match.to)
  if (marks.length) tr.ensureMarks(marks)
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** 全部替换：单事务，从后往前，避免位置漂移。 */
export function replaceAllMatches(
  editor: Editor,
  query: string,
  caseSensitive: boolean,
  replacement: string,
): number {
  const matches = findMatches(editor.state.doc, query, caseSensitive)
  if (!matches.length) return 0

  const tr = editor.state.tr
  for (let i = matches.length - 1; i >= 0; i--) {
    tr.insertText(replacement, matches[i].from, matches[i].to)
  }
  editor.view.dispatch(tr)
  editor.commands.focus()
  return matches.length
}
