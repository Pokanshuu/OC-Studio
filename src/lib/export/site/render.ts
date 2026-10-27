/**
 * 静态展示站 · 内容渲染层（纯函数，无 IO）。
 *
 * 导出的 HTML 是要发布到公网上去的，所以两条底线：
 * 1. **所有文本转义**，`href` 只放行 http/https/mailto 与站内 `#/` 锚点（防 javascript: 注入）。
 * 2. **不认识的节点只降级、不丢内容**：未知块渲染子节点，未知行内保留文本。
 *
 * 正文在库里有两种形态，都要能渲染：
 * - Tiptap JSON（对象，或 `document` 字段 / vault 的 `content` 里存的 JSON 字符串）
 * - 早期的纯文本字段（`bio` / `lifeStory` / `summary` 等）
 */

export interface DocMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface DocNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: DocMark[]
  content?: DocNode[]
}

export interface RenderOptions {
  /** wikiLink / mention → 站内链接；返回 null 就按纯文本渲染（目标已删除等情况） */
  resolveLink?: (kind: string, id: number, label: string) => string | null
  /** 图片 src 重写（内联 data URI 时用） */
  resolveImage?: (src: string) => string
}

/** mention.entityType → 站点路由段 */
const ROUTE_BY_KIND: Record<string, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  world: 'world',
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 放行 http/https/mailto 与站内锚点（`#/`、纯 `#`），其余一律判 null。
 * 顺带把 `<`、`"`、换行剔掉，避免把属性值撑破。
 */
export function safeHref(href: string): string | null {
  const trimmed = href.trim()
  if (!trimmed) return null
  const clean = trimmed.replace(/[<"\n\r]/g, '')
  if (/^(https?:\/\/|mailto:|#)/i.test(clean)) return clean
  return null
}

function attrString(node: DocNode, key: string): string {
  const value = node.attrs?.[key]
  return typeof value === 'string' ? value : ''
}

function attrNumber(node: DocNode, key: string): number | null {
  const value = node.attrs?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function attrBool(node: DocNode, key: string): boolean {
  return node.attrs?.[key] === true
}

/** 行内文本外面包标记。marks 数组的顺序就是「外 → 内」，按序包裹即可。 */
function wrapMarks(text: string, marks: DocMark[] | undefined, options: RenderOptions): string {
  if (!marks || marks.length === 0) return text
  let out = text
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        out = `<strong>${out}</strong>`
        break
      case 'italic':
        out = `<em>${out}</em>`
        break
      case 'strike':
        out = `<s>${out}</s>`
        break
      case 'underline':
        out = `<u>${out}</u>`
        break
      case 'code':
        out = `<code>${out}</code>`
        break
      case 'small':
        out = `<small>${out}</small>`
        break
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? safeHref(mark.attrs.href) : null
        out = href ? `<a href="${escapeHtml(href)}">${out}</a>` : out
        break
      }
      default:
        break
    }
  }
  void options
  return out
}

/** wikiLink / mention 的站内链接；解析不到就退回纯文本标签。 */
function renderRef(node: DocNode, kind: string, options: RenderOptions): string {
  const label = attrString(node, 'label') || attrString(node, 'raw') || '未命名'
  const id = attrNumber(node, 'id')
  const route = ROUTE_BY_KIND[kind]
  if (id === null || !route) return escapeHtml(label)
  const href = options.resolveLink ? options.resolveLink(kind, id, label) : `#/${route}/${id}`
  if (!href) return escapeHtml(label)
  return `<a class="ref" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
}

function renderImageBlock(node: DocNode, options: RenderOptions): string {
  const rawSrc = attrString(node, 'src')
  if (!rawSrc) return ''
  const src = options.resolveImage ? options.resolveImage(rawSrc) : rawSrc
  const width = attrNumber(node, 'width')
  const style = width ? ` style="width:${width}px"` : ''
  return `<figure class="doc-image"><img src="${escapeHtml(src)}" alt="" loading="lazy"${style}></figure>`
}

function renderInlineNode(node: DocNode, options: RenderOptions): string {
  switch (node.type) {
    case 'text':
      return wrapMarks(escapeHtml(node.text ?? ''), node.marks, options)
    case 'hardBreak':
      return '<br>'
    case 'imageBlock':
      return renderImageBlock(node, options)
    case 'wikiLink':
      return renderRef(node, 'world', options)
    case 'mention':
      return renderRef(node, attrString(node, 'entityType') || 'world', options)
    default: {
      // 未知行内节点：保留文本，别把内容丢了
      const inner = (node.content ?? []).map((child) => renderInlineNode(child, options)).join('')
      return inner || escapeHtml(node.text ?? '')
    }
  }
}

function inlineContent(node: DocNode, options: RenderOptions): string {
  return (node.content ?? []).map((child) => renderInlineNode(child, options)).join('')
}

function renderListItem(node: DocNode, options: RenderOptions, task: boolean): string {
  const inner = (node.content ?? []).map((child) => renderBlock(child, options)).join('')
  if (!task) return `<li>${inner}</li>`
  const box = attrBool(node, 'checked') ? '☑' : '☐'
  return `<li class="task"><span class="task-box">${box}</span><div class="task-body">${inner}</div></li>`
}

function renderBlock(node: DocNode, options: RenderOptions): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${inlineContent(node, options)}</p>`
    case 'heading': {
      const level = Math.min(Math.max(attrNumber(node, 'level') ?? 1, 1), 4)
      return `<h${level}>${inlineContent(node, options)}</h${level}>`
    }
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map((child) => renderBlock(child, options)).join('')}</blockquote>`
    case 'codeBlock': {
      const code = (node.content ?? [])
        .map((child) => (child.type === 'text' ? (child.text ?? '') : ''))
        .join('')
      return `<pre><code>${escapeHtml(code)}</code></pre>`
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((child) => renderListItem(child, options, false)).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map((child) => renderListItem(child, options, false)).join('')}</ol>`
    case 'taskList':
      return `<ul class="task-list">${(node.content ?? []).map((child) => renderListItem(child, options, true)).join('')}</ul>`
    case 'listItem':
      return renderListItem(node, options, false)
    case 'taskItem':
      return renderListItem(node, options, true)
    case 'horizontalRule':
      return '<hr>'
    case 'table':
      return `<div class="table-wrap"><table>${(node.content ?? [])
        .map((child) => renderBlock(child, options))
        .join('')}</table></div>`
    case 'tableRow':
      return `<tr>${(node.content ?? []).map((child) => renderBlock(child, options)).join('')}</tr>`
    case 'tableHeader':
    case 'tableCell': {
      const tag = node.type === 'tableHeader' ? 'th' : 'td'
      const colspan = attrNumber(node, 'colspan')
      const rowspan = attrNumber(node, 'rowspan')
      const span =
        (colspan && colspan > 1 ? ` colspan="${colspan}"` : '') +
        (rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '')
      return `<${tag}${span}>${inlineContent(node, options)}</${tag}>`
    }
    case 'imageBlock':
      return renderImageBlock(node, options)
    default: {
      // 未知块：把子节点渲染出来（多为 paragraph / text），别丢内容
      const children = node.content ?? []
      if (children.length === 0) return ''
      return children.map((child) => renderBlock(child, options)).join('')
    }
  }
}

function isDoc(value: unknown): value is DocNode {
  return typeof value === 'object' && value !== null && (value as DocNode).type === 'doc'
}

/** 纯文本 → HTML：空行分段，单换行视为段内换行。 */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((chunk) => {
      const inner = chunk.split('\n').map((line) => escapeHtml(line)).join('<br>')
      return `<p>${inner}</p>`
    })
    .join('')
}

/**
 * 正文 → HTML。入参可以是 Tiptap JSON 对象、JSON 字符串、或早期的纯文本字段。
 */
export function renderRichText(value: unknown, options: RenderOptions = {}): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('{')) {
      try {
        return renderRichText(JSON.parse(trimmed), options)
      } catch {
        // 不是 JSON，就是普通文本
      }
    }
    return plainTextToHtml(value)
  }
  if (typeof value !== 'object') return ''
  const doc = value as DocNode
  const children = isDoc(doc) ? (doc.content ?? []) : [doc]
  return children.map((child) => renderBlock(child, options)).join('')
}

/** 收集正文里出现的图片 src（用于内联成 data URI）。 */
export function collectDocImages(value: unknown): string[] {
  const found: string[] = []
  const walk = (node: DocNode): void => {
    if (node.type === 'imageBlock') {
      const src = attrString(node, 'src')
      if (src) found.push(src)
    }
    for (const child of node.content ?? []) walk(child)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{')) {
      try {
        walk(JSON.parse(trimmed) as DocNode)
      } catch {
        // 纯文本，没有图片
      }
    }
    return found
  }
  if (value && typeof value === 'object') walk(value as DocNode)
  return found
}

/** 正文里有没有实际内容（用于「没有就不渲染该区块」）。 */
export function hasRichText(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value !== 'object') return false
  const doc = value as DocNode
  const children = isDoc(doc) ? (doc.content ?? []) : [doc]
  return children.some((child) => renderBlock(child, {}).trim().length > 0)
}

/** 正文 → 纯文本（列表摘要、标题旁注用）。 */
export function plainTextOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{')) {
      try {
        return plainTextOf(JSON.parse(trimmed))
      } catch {
        // 不是 JSON，就是普通文本
      }
    }
    return value
  }
  if (typeof value !== 'object') return ''
  const walk = (node: DocNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    if (node.type === 'wikiLink' || node.type === 'mention') return attrString(node, 'label')
    return (node.content ?? []).map(walk).join('')
  }
  const doc = value as DocNode
  return (isDoc(doc) ? (doc.content ?? []) : [doc]).map(walk).join('\n')
}
