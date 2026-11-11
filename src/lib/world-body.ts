import type { Editor } from '@tiptap/core'

/**
 * 词条正文的**唯一读取入口**。
 *
 * 历史上词条正文有两条形态并存：
 * - `content` —— Tiptap 文档的 JSON 字符串（编辑器与大部分界面在读）
 * - `document` —— Tiptap 文档对象（vault 写入侧、能力层、导出在读）
 *
 * 装载时 `applyDocumentBodies` 为了伺候两拨调用方，把同一份正文**写了两遍**
 * （`document` 给写入侧，`content` 给编辑器）。两份就一定会漂：改了 A 忘了 B，
 * 编辑器显示的和写回文件的就是两个东西。
 *
 * 现在**只认 `document`**：
 * - 写入一律产出 `document`（对象），`content` 落成空串
 * - 读取一律走这里；`content` 只剩**老数据兜底**（还没经过一次保存的行）
 *
 * 兜底分支刻意保留：老库里 `content` 是 JSON 字符串或是纯文本（novel 早期版本
 * 直接把 Markdown 存进来过），两种都要认，而且都不能抛。
 */

/** 词条正文能出现的最小形态：Tiptap 文档对象，或老数据里的纯文本 */
export type WorldBody = object | string

interface WorldBodySource {
  /** 老字段：JSON 字符串或纯文本 */
  content?: string
  /** 正字段：Tiptap 文档 */
  document?: unknown
}

/** 读正文；没有正文返回空串（编辑器和纯文本消费者都把它当"空"） */
export function worldBodyOf(entry: WorldBodySource): WorldBody {
  const doc = entry.document
  if (doc !== null && typeof doc === 'object') return doc as object

  const raw = (entry.content ?? '').trim()
  if (raw === '') return ''

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') return parsed as object
    // JSON 但不是一个对象（比如存成了 `"abc"`）：当纯文本用
    return raw
  } catch {
    // 不是 JSON —— 老数据直接把纯文本 / Markdown 存在 content 里
    return raw
  }
}

/** 有没有正文（避免各处自己判断空态） */
export function hasWorldBody(entry: WorldBodySource): boolean {
  const body = worldBodyOf(entry)
  return typeof body === 'string' ? body.trim() !== '' : true
}

/**
 * 写正文时用的补丁：`document` 拿走正文，`content` 清空。
 *
 * 清空而不是同步写一遍 —— 同步写就是又回到两份真源。旧行的 `content` 会在
 * 第一次保存时被这一条顺手清掉。
 */
export function worldBodyPatch(doc: unknown): { document: unknown; content: string } {
  return { document: doc, content: '' }
}

/**
 * 把正文灌进编辑器，但**不进撤销历史**。
 *
 * 事故形状（2026-11-11 复现）：打开一篇笔记、什么都不改、按一次 Ctrl+Z —— 正文被清空。
 * 原因是 TipTap 的 `setContent` 会把「装载」记成一条可撤销的操作，撤销就回到空文档；
 * 而正文是防抖自动保存的，空文档随后会被写进文件。
 *
 * `setContent` 与 `addToHistory: false` 必须写在**同一条链**上（链里共用一个 transaction），
 * 分两次 run 就不算同一条事务，历史里仍然会留下装载这一步。
 */
export function loadBodyWithoutHistory(editor: Editor, body: WorldBody): void {
  editor
    .chain()
    .setContent(body)
    .command(({ tr }) => {
      tr.setMeta('addToHistory', false)
      return true
    })
    .run()
}
