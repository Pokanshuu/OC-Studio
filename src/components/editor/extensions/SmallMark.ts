import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * `<small>` 行内标记。
 *
 * vault 里的 Markdown 用 `<small>…</small>` 写旁注（实测 32 处），
 * 这是那批文件里**唯一**用到的行内 HTML。不把它做成标记的话，
 * 要么被当成纯文本（正文里露出标签），要么在往返时被丢掉。
 * 渲染保持 `<small>`，因此 Markdown 往返文本不变。
 */
export const SmallMark = Mark.create({
  name: 'small',

  parseHTML() {
    return [{ tag: 'small' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['small', mergeAttributes(HTMLAttributes), 0]
  },
})
