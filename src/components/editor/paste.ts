/**
 * 粘贴管线 —— 把「剪贴板里到底是什么」收敛成三条明确规则。
 *
 * 1. **富文本（text/html）**：清洗后交给 ProseMirror 解析。清掉脚本 / 内联样式 /
 *    无意义 span，把 Word 的 `<b style="font-weight:bold">` 还原成语义标签，
 *    保留标题、列表、表格、链接、图片、`@` 提及。
 * 2. **纯文本**：看起来像 Markdown（标题 / 列表 / 引用 / 代码块 / 表格）就按 Markdown
 *    转成结构；只是多段文字就按空行拆段；否则交回默认行为（单段插入）。
 * 3. **图片文件**：见 `useImagePasteDrop` —— 只有「没有可读文字」时才走图片路径，
 *    文字优先，避免从微信 / 网页复制图文时只剩一张图。
 *
 * 这里只放纯函数（入参出参都是字符串 / DataTransfer），DOM 解析用 DOMParser，
 * 单测在 `tests/paste.test.ts`。
 */

import MarkdownIt from 'markdown-it'
import { safeHref } from '@/lib/safe-href'

/** 富文本里允许保留的标签；其余标签一律「拆壳留内容」 */
const KEEP_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span',
])

/** 连同内容一起丢掉的标签 */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template',
  'svg', 'canvas', 'audio', 'video',
])

/** 属性白名单：其余（style / class / id / 事件 / 语言标记）一律删 */
const KEEP_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  ol: new Set(['start']),
  li: new Set(['value']),
  // 站内提及 / 图片块复制回来时要保住身份
  span: new Set(['data-type', 'data-id', 'data-label', 'data-entity-type', 'data-raw']),
  div: new Set(['data-type', 'src', 'data-width']),
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

/** 把一段纯文本按 Markdown 渲染成 HTML（已清洗） */
export function markdownToPastedHtml(text: string): string {
  return sanitizePastedHtml(markdown.render(text))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 纯文本 → 段落 / 换行（不解释 Markdown） */
function textToParagraphHtml(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Markdown 的块级信号：至少一条「强信号」，或两条列表行 */
export function looksLikeMarkdown(text: string): boolean {
  const source = text.replace(/\r\n?/g, '\n')
  const strong = [
    /^#{1,6}[ \t]+\S/m, // 标题
    /^[ \t]*```/m, // 代码围栏
    /^[ \t]*>[ \t]?\S/m, // 引用
    /^[ \t]*\|.*\|[ \t]*$/m, // 表格
    /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m, // 表格分隔行
  ]
  if (strong.some((pattern) => pattern.test(source))) return true
  // 列表：一行 `- 你好` 可能只是正文；两行才算结构
  const listLines = source.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/gm) ?? []
  return listLines.length >= 2
}

/**
 * 纯文本粘贴 → HTML；返回 null 表示「交给默认行为」。
 *
 * 单段纯文本不走这里：ProseMirror 默认插入更自然（不额外包一层段落）。
 */
export function plainTextToPastedHtml(text: string): string | null {
  const source = text.replace(/\r\n?/g, '\n')
  if (source.trim() === '') return null
  if (looksLikeMarkdown(source)) return markdownToPastedHtml(source)
  if (!source.includes('\n')) return null
  return textToParagraphHtml(source)
}

/**
 * 富文本清洗。幂等：清洗过的 HTML 再洗一遍结果不变。
 *
 * 保留 mention / imageBlock 这类带 `data-type` 的 span / div（站内复制粘贴
 * 靠它保住 id）；普通 span 拆壳，但先把 `style` 里的粗体 / 斜体 / 下划线
 * 还原成语义标签 —— Word 和网页的加粗几乎都藏在 style 里。
 */
export function sanitizePastedHtml(html: string): string {
  if (html.trim() === '') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  for (const node of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = node.tagName.toLowerCase()

    if (DROP_TAGS.has(tag)) {
      node.remove()
      continue
    }

    // Word / Office 的命名空间标签（o:p、w:proofErr…）：拆壳留内容
    if (tag.includes(':')) {
      unwrap(node)
      continue
    }

    if (!KEEP_TAGS.has(tag)) {
      unwrap(node)
      continue
    }

    // span 的样式先翻译成语义标签，再决定拆不拆（提及节点不能拆，标签文字也不能包壳）
    if (tag === 'span') {
      if (!node.getAttribute('data-type') && !node.getAttribute('data-id')) {
        promoteSpanStyle(node)
        unwrap(node)
        continue
      }
    }

    cleanAttributes(node, tag)

    if (tag === 'a') {
      const href = node.getAttribute('href') ?? ''
      const safe = safeHref(href)
      if (safe === null) {
        unwrap(node)
        continue
      }
      node.setAttribute('href', safe)
    }

    if (tag === 'img') {
      const src = node.getAttribute('src') ?? ''
      // data: 图片不进正文（体积失控，导出也带不走）；其它不安全地址直接丢节点
      if (/^data:/i.test(src) || safeHref(src) === null) {
        node.remove()
        continue
      }
    }
  }

  return doc.body.innerHTML
}

function unwrap(element: Element): void {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

function cleanAttributes(element: Element, tag: string): void {
  const allowed = KEEP_ATTRS[tag]
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase()
    if (name.startsWith('on')) {
      element.removeAttribute(attr.name)
      continue
    }
    if (allowed?.has(name)) continue
    element.removeAttribute(attr.name)
  }
}

/** `<span style="font-weight:bold">` → `<strong>`；斜体 → `<em>`；下划线 → `<u>` */
function promoteSpanStyle(span: Element): void {
  const style = (span.getAttribute('style') ?? '').toLowerCase()
  if (!style) return
  const wraps: string[] = []
  const weight = /font-weight\s*:\s*([^;]+)/.exec(style)?.[1]?.trim() ?? ''
  if (weight === 'bold' || weight === 'bolder' || Number.parseInt(weight, 10) >= 600) wraps.push('strong')
  if (/font-style\s*:\s*italic/.test(style)) wraps.push('em')
  if (/text-decoration[^;]*underline/.test(style)) wraps.push('u')
  if (wraps.length === 0) return

  let target: Element = span
  for (const tag of wraps) {
    const wrapper = span.ownerDocument.createElement(tag)
    while (target.firstChild) wrapper.appendChild(target.firstChild)
    target.appendChild(wrapper)
    target = wrapper
  }
}

/** 剪贴板里有没有「值得按文字粘贴」的内容（HTML 文本 / 图片地址 / 非文件名的纯文本） */
export function clipboardHasReadableText(data: DataTransfer | null): boolean {
  if (!data) return false
  const html = data.getData('text/html')
  if (html.trim() !== '') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if ((doc.body.textContent ?? '').trim() !== '') return true
    if (doc.body.querySelector('img[src]') !== null) return true
  }
  const text = data.getData('text/plain').trim()
  if (text === '') return false
  const names = Array.from(data.files ?? []).map((file) => file.name)
  if (names.length > 0 && names.some((name) => text === name)) return false
  return true
}

/** 剪贴板里有没有图片文件（`files` 或 `items` 两条路都要看） */
export function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromFiles = Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (fromFiles.length > 0) return fromFiles
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}
