/**
 * 「粘贴」这一个动作的**唯一实现**（编辑器三处：右键菜单 / 编辑菜单 / 快捷键复用）。
 *
 * 以前三处各写一遍 `tauriReadClipboard().then(insert).catch(() => {})`：
 * 剪贴板读不到（没授权 / 非安全上下文 / WebView 限制）或里面是空的，菜单点了**毫无反应**，
 * 用户只会以为「粘贴坏了」。现在把三种结果都说出来：
 * - 读到文字 → 插到光标处
 * - 读不到   → 提示「读不到剪贴板，可以用 Ctrl+V」
 * - 空的     → 提示「剪贴板里没有文字」
 */
import type { Editor } from '@tiptap/core'
import { toast } from 'sonner'

import { readClipboardText } from './clipboard-read'

export async function pasteTextIntoEditor(editor: Editor): Promise<void> {
  const text = await readClipboardText()
  if (text === null) {
    toast('读不到剪贴板', { description: '可以直接用 Ctrl+V 粘贴' })
    return
  }
  if (text.trim() === '') {
    toast('剪贴板里没有文字')
    return
  }
  editor.chain().focus().insertContent(text).run()
}
