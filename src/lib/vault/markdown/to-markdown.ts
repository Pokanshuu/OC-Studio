import {
  FALLBACK_FENCE_INFO,
  longestRun,
  sortMarks,
  type TiptapDoc,
  type TiptapMark,
  type TiptapNode,
} from './doc'
import { markdownToTiptap, type LinkRef, type ResolvedLink } from './to-tiptap'

// ── Tiptap JSON → Markdown ──────────────────────────────────────────────
//
// 目标不是「输出最漂亮的 Markdown」，而是「输出能被精确读回来的 Markdown」。
// 三条支撑这个目标的规则：
//
// 1. **标记按开合配对输出，而不是逐节点包裹。**
//    `**粗体 [[链接]] 粗体**` 里的链接节点如果把 bold 在它前后断开重开，
//    就会写成 `**粗体****[[链接]]****粗体**` —— 重新解析后强调结构已经变了
//    （空强调对会互相配对）。所以维护一个「当前打开的标记栈」，只在
//    标记集合真的变化时才开/关定界符。
//
// 2. **转义取最小必要，并由重新解析来判定。**
//    CommonMark 里 `**` 是否构成强调取决于两侧字符的 flanking 规则与**有没有
//    配对的另一端**：`她是 **“宰相…` 里的 `**` 后无闭合，解析器本来就读成
//    纯文本。一律转义会把它写成 `\*\*`，用户的文件就被改写了。这里先按最小
//    转义试一次，把结果重新解析回来与原文档比对；对得上就用它，对不上才退回
//    全量转义。
//
// 3. **块级写法选不会产生歧义的那种。**
//    分割线写 `---`（vault 全用它），且块之间固定空一行，这样 `---` 不会被
//    当成上一段的 setext 下划线；硬换行写「反斜杠 + 换行」而不是「两个空格 +
//    换行」—— 行尾空格会被编辑器悄悄删掉。

export interface TiptapToMarkdownOptions {
  /**
   * mention/wikiLink 节点 → `[[...]]` 文本；返回 null 表示无法表达。
   *
   * 注意：节点带 `attrs.raw` 时会**先**用原文还原，不会走到这里。
   * 这个回调是给「没有原文的引用」（用户在编辑器里新插入的）用的兜底，
   * 典型实现是拿 `attrs.id` 反查实体名。
   */
  serializeLink: (node: TiptapNode) => string | null
  /** imageBlock 节点 → markdown 图片语法；返回 null 表示无法表达 */
  serializeImage?: (node: TiptapNode) => string | null
}

export interface TiptapToMarkdownResult {
  markdown: string
  /** 文档里出现了无法无损表达的内容，已附 oc-document 兜底块 */
  hasFallback: boolean
  /**
   * 触发兜底的节点类型（去重）。
   * 纯节点类型形如 `table`；带原因的形如 `table:colwidth`、`mark:highlight`，
   * 冒号前缀始终是节点/标记类型，方便 UI 归并展示。
   */
  unsupported: string[]
}

interface RenderContext {
  options: TiptapToMarkdownOptions
  unsupported: Set<string>
}

/** 转义力度：先试 minimal，自校验不过再退回 full */
type EscapeLevel = 'minimal' | 'full'

/** 可以用定界符成对包裹的标记（code 单独处理，它排斥其它标记） */
const WRAPPABLE_MARKS: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'strike',
  'underline',
  'small',
  'link',
])

/**
 * 任何情况下都要转义的字符：
 *   · 反斜杠自身（否则会去转义后面的字符）
 *   · 反引号（否则会开出代码跨度，解析回来就变成 code 标记了）
 *
 * 其余有语法的字符 —— `*` `_` `~`（强调/删除线）、`[` `]`（链接）、
 * `<` `>` `&`（HTML 与实体）—— **一律不在这里**。它们是否危险完全取决于上下文：
 * `**“引号”**` 因为两侧 flanking 不成立本来就读成纯文本，`<0.5%` 也不是合法标签，
 * 一律转义会把它们写成 `\*\*` / `\<0.5%`，等于改写用户的文件。
 * 这些交给自校验决定：最小转义先试一次，重新解析对不上才退回全量转义。
 */
const ALWAYS_ESCAPE_PATTERN = /[\\`]/g
/** 只有全量转义时才处理：上下文相关的那批语法字符 */
const CONTEXTUAL_ESCAPE_PATTERN = /[*_~[\]<>&]/g

/**
 * Tiptap 文档 → Markdown。
 *
 * 遇到无法无损表达的节点时不抛错、也不静默丢：正文照常输出可读 Markdown，
 * 末尾附一个 `oc-document` 围栏块保存原始 JSON，由 markdownToTiptap 原样还原。
 */
export function tiptapToMarkdown(doc: unknown, options: TiptapToMarkdownOptions): TiptapToMarkdownResult {
  const root = assertDoc(doc)
  const ctx: RenderContext = { options, unsupported: new Set() }

  const body = renderBlocks(root.content, ctx, true)
  const unsupported = [...ctx.unsupported]

  if (unsupported.length === 0) {
    return { markdown: body, hasFallback: false, unsupported: [] }
  }

  const fallback = buildFallbackBlock(root)
  return {
    markdown: body === '' ? fallback : `${body}\n\n${fallback}`,
    hasFallback: true,
    unsupported,
  }
}

function assertDoc(value: unknown): TiptapDoc {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('tiptapToMarkdown：入参不是 Tiptap 文档对象')
  }
  const record = value as Record<string, unknown>
  if (record.type !== 'doc') {
    throw new Error(`tiptapToMarkdown：文档 type 应为 "doc"，实际为 ${JSON.stringify(record.type)}`)
  }
  if (!Array.isArray(record.content)) {
    throw new Error('tiptapToMarkdown：文档缺少 content 数组')
  }
  return { type: 'doc', content: record.content as TiptapNode[] }
}

function buildFallbackBlock(doc: TiptapDoc): string {
  const json = JSON.stringify(doc, null, 2)
  // JSON 里可能出现反引号（正文内容），围栏必须比最长的一段更长
  const fence = '`'.repeat(Math.max(3, longestRun(json, '`') + 1))
  return `${fence}${FALLBACK_FENCE_INFO}\n${json}\n${fence}`
}

/**
 * 渲染一串块。块之间固定空一行。
 *
 * 已知取舍：原文里块与块之间**空几行**（0 行 / 2 行）无法从文档模型还原 ——
 * ProseMirror 的节点不带这种位置信息。所以这里统一输出规范形式。
 * 影响面与理由见 scripts/vault-markdown-check.ts 的报告。
 */
function renderBlocks(nodes: TiptapNode[] | undefined, ctx: RenderContext, firstAtLineStart: boolean): string {
  if (nodes === undefined || nodes.length === 0) return ''
  const parts: string[] = []
  nodes.forEach((node, index) => {
    const rendered = renderBlock(node, ctx, index === 0 ? firstAtLineStart : true)
    if (rendered !== '') parts.push(rendered)
  })
  return parts.join('\n\n')
}

/** atLineStart：该块的首个字符是否真的落在行首（标题/引用/列表项里不是） */
function renderBlock(node: TiptapNode, ctx: RenderContext, atLineStart: boolean): string {
  switch (node.type) {
    case 'paragraph':
      return renderInlineVerified(node.content, ctx, false, atLineStart)

    case 'heading': {
      const level = headingLevel(node)
      const inline = renderInlineVerified(node.content, ctx, false, false)
      const hashes = '#'.repeat(level)
      return inline === '' ? hashes : `${hashes} ${inline}`
    }

    case 'blockquote': {
      const inner = renderBlocks(node.content, ctx, false)
      if (inner === '') return '>'
      return inner
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n')
    }

    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return renderList(node, ctx)

    case 'codeBlock':
      return renderCodeBlock(node)

    case 'horizontalRule':
      // vault 统一用 `---`；块之间固定空一行，所以不会被当成 setext 下划线
      return '---'

    case 'table':
      return renderTable(node, ctx)

    case 'imageBlock': {
      const image = renderImageBlock(node, ctx)
      if (image === null) {
        ctx.unsupported.add('imageBlock')
        return ''
      }
      return image
    }

    case 'listItem':
    case 'taskItem':
    case 'tableRow':
    case 'tableCell':
    case 'tableHeader': {
      // 这些节点只能出现在对应容器里；单独出现说明文档结构异常，
      // 降级当容器渲染，尽量不丢里面的字
      ctx.unsupported.add(`${node.type}:orphan`)
      return renderBlocks(node.content, ctx, atLineStart)
    }

    default: {
      ctx.unsupported.add(node.type)
      return renderBlocks(node.content, ctx, atLineStart)
    }
  }
}

function headingLevel(node: TiptapNode): number {
  const raw = node.attrs?.level
  const level = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1
  if (level < 1) return 1
  if (level > 6) return 6
  return level
}

function renderList(node: TiptapNode, ctx: RenderContext): string {
  const items = node.content ?? []
  if (items.length === 0) return ''

  const ordered = node.type === 'orderedList'
  const startRaw = node.attrs?.start
  const start = typeof startRaw === 'number' && Number.isFinite(startRaw) ? Math.floor(startRaw) : 1

  return items
    .map((item, index) => {
      let marker: string
      if (node.type === 'taskList') {
        marker = item.attrs?.checked === true ? '- [x] ' : '- [ ] '
      } else if (ordered) {
        marker = `${start + index}. `
      } else {
        marker = '- '
      }
      // 列表项标记已经占掉了行首，里面的首个块不算落在行首
      const inner = renderBlocks(item.content, ctx, false)
      return indentWithMarker(inner, marker)
    })
    .join('\n')
}

/**
 * 首行接在标记之后，其余行缩进到与首行内容对齐。
 * 缩进宽度必须等于标记自身长度：`1. ` 是 3 列、`- [x] ` 是 6 列，
 * 缩进不足时嵌套列表不会被认成子级，会被解析成平级或懒续行。
 */
function indentWithMarker(content: string, marker: string): string {
  if (content === '') return marker.trimEnd()
  const lines = content.split('\n')
  const width = marker.length
  const head = `${marker}${lines[0]}`
  const tail = lines.slice(1).map((line) => (line === '' ? '' : `${' '.repeat(width)}${line}`))
  return [head, ...tail].join('\n')
}

function renderCodeBlock(node: TiptapNode): string {
  const languageRaw = node.attrs?.language
  // 语言串直接进围栏 info，必须滤掉反引号与空白，否则会破坏围栏行
  const language =
    typeof languageRaw === 'string' ? languageRaw.trim().split(/\s+/)[0].replace(/`/g, '') : ''
  const code = (node.content ?? []).map((child) => child.text ?? '').join('')
  const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1))
  return `${fence}${language}\n${code}\n${fence}`
}

function renderTable(node: TiptapNode, ctx: RenderContext): string {
  const rows = node.content ?? []
  if (rows.length === 0) {
    ctx.unsupported.add('table:empty')
    return ''
  }

  const grid = rows.map((row) => row.content ?? [])
  const columnCount = grid[0].length

  if (grid.some((cells) => cells.length !== columnCount)) {
    // GFM 表格每行列数必须一致
    ctx.unsupported.add('table:ragged')
  }
  if (grid[0].some((cell) => cell.type !== 'tableHeader')) {
    // GFM 表头固定是第一行，Tiptap 允许表头出现在任意行
    ctx.unsupported.add('table:noHeaderRow')
  }

  const texts = grid.map((cells) => cells.map((cell) => renderTableCell(cell, ctx)))
  const header = texts[0]

  // 分隔行原文（如 `|------|-----|`）是纯排版风格，文档模型里没有位置；
  // 解析时若能带上 rawSeparator 就原样还原，否则输出规范形式。
  const rawSeparator = node.attrs?.rawSeparator
  const separator =
    typeof rawSeparator === 'string' && rawSeparator.trim() !== ''
      ? rawSeparator.trim()
      : `| ${header.map(() => '---').join(' | ')} |`

  const lines = [`| ${header.join(' | ')} |`, separator]
  for (const cells of texts.slice(1)) {
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

function renderTableCell(cell: TiptapNode, ctx: RenderContext): string {
  const attrs = cell.attrs ?? {}
  const colspan = typeof attrs.colspan === 'number' ? attrs.colspan : 1
  const rowspan = typeof attrs.rowspan === 'number' ? attrs.rowspan : 1
  if (colspan !== 1 || rowspan !== 1) ctx.unsupported.add('table:merged')
  if (attrs.colwidth !== null && attrs.colwidth !== undefined) ctx.unsupported.add('table:colwidth')

  const blocks = cell.content ?? []
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type !== 'paragraph') {
      // GFM 单元格里塞不下列表/代码块/嵌套表格
      ctx.unsupported.add('table:blockInCell')
      continue
    }
    // 单元格被 `|` 包住，内容不落在行首
    parts.push(renderInlineVerified(block.content, ctx, true, false))
  }
  // 单元格内不能有真换行，会拆行；用 <br> 表达换行
  return parts.join('<br>')
}

function renderImageBlock(node: TiptapNode, ctx: RenderContext): string | null {
  const custom = ctx.options.serializeImage
  if (custom !== undefined) return custom(node)

  const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
  if (src === '') return null
  if (node.attrs?.width !== null && node.attrs?.width !== undefined) ctx.unsupported.add('imageBlock:width')
  return `![](${encodeHref(src)})`
}

// ── 行内：标记开合配对 ──────────────────────────────────────────────────

interface OpenFrame {
  key: string
  close: string
}

function markKey(mark: TiptapMark): string {
  return `${mark.type}\u0000${JSON.stringify(mark.attrs ?? null)}`
}

function delimitersFor(mark: TiptapMark, ctx: RenderContext): { open: string; close: string } | null {
  switch (mark.type) {
    case 'bold':
      return { open: '**', close: '**' }
    case 'italic':
      return { open: '*', close: '*' }
    case 'strike':
      return { open: '~~', close: '~~' }
    case 'underline':
      return { open: '<u>', close: '</u>' }
    case 'small':
      return { open: '<small>', close: '</small>' }
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
      if (href === '') {
        ctx.unsupported.add('link:emptyHref')
        return null
      }
      if (mark.attrs?.title !== null && mark.attrs?.title !== undefined) {
        // markdown 链接的 title 能写出来，但我们的解析不承载它，往返会丢
        ctx.unsupported.add('link:title')
      }
      return { open: '[', close: `](${encodeHref(href)})` }
    }
    default:
      return null
  }
}

/**
 * 先按最小转义试一次，把结果重新解析回行内序列与原始节点比对；
 * 对得上就用它（用户的排版保住了），对不上退回全量转义。
 *
 * 校验时的解析前缀：`atLineStart` 为假时补一个中性字符，否则 `# 标题` 这种
 * 本来无害的内容会被当成块级语法而误判成「需要转义」。
 */
function renderInlineVerified(
  nodes: TiptapNode[] | undefined,
  ctx: RenderContext,
  inTable: boolean,
  atLineStart: boolean,
): string {
  const expected = nodes ?? []
  const minimal = renderInline(expected, ctx, inTable, atLineStart, 'minimal')
  if (inlineRoundTrips(expected, minimal, inTable, atLineStart)) return minimal
  return renderInline(expected, ctx, inTable, atLineStart, 'full')
}

function renderInline(
  nodes: TiptapNode[],
  ctx: RenderContext,
  inTable: boolean,
  atLineStart: boolean,
  level: EscapeLevel,
): string {
  const list = mergeAdjacentText(nodes)
  const open: OpenFrame[] = []
  let out = ''
  let lineStart = atLineStart

  const closeTo = (count: number): void => {
    while (open.length > count) {
      const frame = open.pop()
      if (frame !== undefined) out += frame.close
    }
  }

  /** 把当前打开的标记同步到 target：公共前缀保留，其余先关后开 */
  const syncMarks = (target: readonly TiptapMark[]): void => {
    const usable = target.filter((mark) => {
      // code 单独处理（它排斥其它标记，且不能嵌在别的标记里）
      if (mark.type === 'code') return false
      if (WRAPPABLE_MARKS.has(mark.type)) return true
      // 编辑器 schema 之外的自造标记：没有对应写法，记下来交给兜底块
      ctx.unsupported.add(`mark:${mark.type}`)
      return false
    })
    let common = 0
    while (
      common < open.length &&
      common < usable.length &&
      open[common].key === markKey(usable[common])
    ) {
      common += 1
    }
    closeTo(common)
    for (let i = common; i < usable.length; i += 1) {
      const delimiters = delimitersFor(usable[i], ctx)
      if (delimiters === null) break
      out += delimiters.open
      open.push({ key: markKey(usable[i]), close: delimiters.close })
    }
  }

  for (const node of list) {
    switch (node.type) {
      case 'text': {
        const marks = node.marks ?? []
        const codeMarked = marks.some((mark) => mark.type === 'code')
        if (codeMarked) {
          if (marks.length > 1) ctx.unsupported.add('code:withOtherMarks')
          // 代码跨度是字面量，不能嵌在别的标记里
          closeTo(0)
        } else {
          syncMarks(marks)
        }

        const segments = (node.text ?? '').split('\n')
        segments.forEach((rawSegment, index) => {
          if (index > 0) {
            closeTo(0)
            out += inTable ? '<br>' : '\n'
            lineStart = true
          }
          // 续行行首的缩进解析时本来就会被吃掉，这里一起收敛才不会漂移
          const segment = index > 0 ? rawSegment.replace(/^[ \t]+/, '') : rawSegment
          if (segment === '') return
          if (codeMarked) {
            // 代码跨度内容是字面量：绝不能转义（反斜杠会变成真字符，且每轮多一层）
            out += codeSpan(segment, inTable)
          } else {
            let text = escapeText(segment, inTable, level)
            if (lineStart) text = escapeLineStart(text, inTable)
            out += text
          }
          lineStart = false
        })
        break
      }

      case 'hardBreak': {
        // 断行前先把标记全关掉再在下一段重开。否则 `**A` + 换行 + `B` 这种
        // 跨断行的强调会把**未加粗的后续文本**卷进强调里，两轮解析就不相等了。
        // 而 markdown 的软换行在 Obsidian 里本来就按换行显示（严格换行默认关），
        // 所以断行统一写成一个裸换行：它重新解析回来同样是断行，且与原文逐字节一致。
        closeTo(0)
        out += inTable ? '<br>' : '\n'
        lineStart = true
        break
      }

      case 'mention':
      case 'wikiLink': {
        const marks = node.marks ?? []
        // 链接本身就是行内语法，不能再套一层 []()；只应用非 link 的标记
        if (marks.some((mark) => mark.type === 'link')) ctx.unsupported.add('link:onLinkNode')
        syncMarks(marks.filter((mark) => mark.type !== 'link'))

        const serialized = serializeLinkNode(node, ctx)
        if (serialized === null) {
          ctx.unsupported.add(node.type)
          const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
          if (label !== '') {
            let text = escapeText(label, inTable, level)
            if (lineStart) text = escapeLineStart(text, inTable)
            out += text
          }
        } else {
          out += serialized
        }
        lineStart = false
        break
      }

      case 'imageBlock': {
        closeTo(0)
        const image = renderImageBlock(node, ctx)
        if (image === null) ctx.unsupported.add('imageBlock')
        else out += image
        lineStart = false
        break
      }

      default: {
        ctx.unsupported.add(node.type)
        break
      }
    }
  }

  closeTo(0)
  return out
}

/**
 * 链接节点的写回。
 *
 * **优先用 `attrs.raw` 原样还原**：真实 vault 里有 18 处带锚点的
 * 带锚点与别名的 `[[ ]]`。锚点是 Obsidian 的
 * 标题跳转，在这套节点属性里没有位置 —— 只有把 `[[ ]]` 内的原文整份带在
 * 节点上，写回时才不会被悄悄改写成裸链接。
 */
function serializeLinkNode(node: TiptapNode, ctx: RenderContext): string | null {
  const raw = node.attrs?.raw
  if (typeof raw === 'string' && raw.trim() !== '') return `[[${raw}]]`
  return ctx.options.serializeLink(node)
}

/** 合并相邻的同标记文本节点（`**a**` 紧挨 `**b**` 会被解析器并成一个 strong） */
function mergeAdjacentText(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.text ?? ''
      if (text === '') continue
      const prev = out[out.length - 1]
      if (prev !== undefined && prev.type === 'text' && marksEqualForMerge(prev.marks, node.marks)) {
        prev.text = `${prev.text ?? ''}${text}`
        continue
      }
    }
    out.push({ ...node })
  }
  return out
}

function marksEqualForMerge(a: readonly TiptapMark[] | undefined, b: readonly TiptapMark[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  return left.every((mark, index) => markKey(mark) === markKey(right[index]))
}

// ── 自校验 ──────────────────────────────────────────────────────────────

/**
 * 把候选 Markdown 重新解析回行内序列，与原节点比对。
 * 只比「文本 + 标记 + 链接原文」这些转义会影响的东西，不比节点身份。
 */
function inlineRoundTrips(
  expected: TiptapNode[],
  markdown: string,
  inTable: boolean,
  atLineStart: boolean,
): boolean {
  if (markdown === '') return mergeAdjacentText(expected).length === 0

  // 表格单元格里的 `<br>` 与 `\|` 是单元格专用写法，单独用段落解析会误判
  const context = inTable ? markdown.replace(/<br>/g, '') : markdown
  const prefix = atLineStart ? '' : 'x'
  const links = new Map<string, TiptapNode>()
  collectLinks(expected, links)
  const resolveLink = (ref: LinkRef): ResolvedLink | null => {
    const node = links.get(ref.raw)
    if (node === undefined) return null
    const entityType = node.attrs?.entityType
    return {
      type: node.type === 'mention' ? 'mention' : 'wikiLink',
      attrs: {
        id: String(node.attrs?.id ?? ''),
        label: String(node.attrs?.label ?? ''),
        ...(typeof entityType === 'string' ? { entityType } : {}),
        raw: ref.raw,
      },
    }
  }

  let parsed: TiptapDoc
  try {
    parsed = markdownToTiptap(`${prefix}${context}\n`, { resolveLink })
  } catch {
    return false
  }

  const first = parsed.content[0]
  if (parsed.content.length !== 1 || first === undefined || first.type !== 'paragraph') return false

  const expectedWithPrefix: TiptapNode[] =
    prefix === '' ? expected : [{ type: 'text', text: prefix }, ...expected]

  return inlineFingerprint(expectedWithPrefix) === inlineFingerprint(first.content ?? [])
}

function collectLinks(nodes: TiptapNode[], out: Map<string, TiptapNode>): void {
  for (const node of nodes) {
    if (node.type === 'mention' || node.type === 'wikiLink') {
      const raw = node.attrs?.raw
      if (typeof raw === 'string' && !out.has(raw)) out.set(raw, node)
    }
    if (node.content !== undefined) collectLinks(node.content, out)
  }
}

/** 行内序列的规范化指纹：合并同标记相邻文本、标记排序、链接只看原文 */
function inlineFingerprint(nodes: TiptapNode[]): string {
  return JSON.stringify(
    mergeAdjacentText(nodes).map((node) => {
      const marks = sortMarks(node.marks ?? [])
      if (node.type === 'text') return { t: 'text', text: node.text ?? '', marks }
      if (node.type === 'hardBreak') return { t: 'hardBreak' }
      if (node.type === 'mention' || node.type === 'wikiLink') {
        return { t: 'link', raw: String(node.attrs?.raw ?? ''), marks }
      }
      if (node.type === 'imageBlock') return { t: 'image', src: String(node.attrs?.src ?? '') }
      return { t: node.type }
    }),
  )
}

// ── 转义 ────────────────────────────────────────────────────────────────

/**
 * 行首的块级标记必须转义，否则「一个恰好以 `- ` 开头的段落」写回去就变成列表了。
 * 只在文本真的位于行首时调用 —— 标题里的 `### 1. 童年` 不该被写成 `### 1\. 童年`。
 *
 * 判定要**按标记真正成立的条件**来，不能看到 `*` / `#` 就转：
 *   · `-` `+` `*` 后面必须跟空白（或整行只有一个标记）才是列表项
 *   · `#` 后面必须跟空白才是标题
 *   · `>` 后面跟什么都成立（引用可以惰性续行）
 *   · `-` `*` `_` `=` 必须整行只有这些符号才是分割线 / setext 下划线
 * 实测踩过：`**穿越者现象…**此前的周期…` 这一行整体被解析成纯文本，
 * 一律转义会写成 `\**穿越者…`，等于把用户的排版改掉。
 */
function escapeLineStart(text: string, inTable: boolean): string {
  if (text === '') return text
  if (/^\d{1,9}[.)](\s|$)/.test(text)) return text.replace(/^(\d{1,9})([.)])/, '$1\\$2')
  if (/^[-+*](\s|$)/.test(text)) return `\\${text}`
  if (/^#{1,6}(\s|$)/.test(text)) return `\\${text}`
  if (text.startsWith('>')) return `\\${text}`
  // 分割线需要至少三个标记字符：`***` / `---` / `* * *` 成立，而 `**` 不成立
  // （实测踩过：把 `**` 当分割线转义，`**[[大橄榄]]**是…` 就被写成 `\**[[大橄榄]]**是…`）
  if (/^([-*_])(\s*\1){2,}\s*$/.test(text)) return `\\${text}`
  if (/^=+\s*$/.test(text)) return `\\${text}`
  if (/^(```|~~~)/.test(text)) return `\\${text}`
  if (inTable && text.startsWith('|')) return `\\${text}`
  return text
}

function escapeText(text: string, inTable: boolean, level: EscapeLevel): string {
  let out = text.replace(ALWAYS_ESCAPE_PATTERN, '\\$&')
  if (level === 'full') out = out.replace(CONTEXTUAL_ESCAPE_PATTERN, '\\$&')
  // `!` 只在紧跟 `[` 时才有意义（图片语法），别的一律不转，免得把普通感叹号弄脏
  out = out.replace(/!(?=\[)/g, '\\!')
  if (inTable) out = out.replace(/\|/g, '\\|')
  return out
}

/**
 * 代码跨度：围栏长度必须比内容里最长的一段反引号更长，
 * 且内容以反引号或（两侧）空格开头结尾时要补一个空格，避免被解析规则吃掉。
 *
 * 表格单元格里的 `|` 是列分隔符，代码跨度也挡不住它 —— 必须先写成 `\|`，
 * 否则一行会被切成两个单元格（实测 markdown-it 在表格里会把 `\|` 还原回 `|`）。
 */
function codeSpan(text: string, inTable: boolean): string {
  const content = inTable ? text.replace(/\|/g, '\\|') : text
  const width = Math.max(1, longestRun(content, '`') + 1)
  const fence = '`'.repeat(width)
  const needsPad =
    content.startsWith('`') ||
    content.endsWith('`') ||
    (content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '')
  const pad = needsPad ? ' ' : ''
  return `${fence}${pad}${content}${pad}${fence}`
}

/** 链接目标里有空格或括号时必须用尖括号包起来，否则链接会在括号处截断 */
function encodeHref(href: string): string {
  return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, '')}>` : href
}
