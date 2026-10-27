import MarkdownIt from 'markdown-it'
// markdown-it 把「实例类型」和「默认导出的可调用构造器」分开导出：
// 默认导出是值（MarkdownItCallable），类型要单独按名字取。
import type { MarkdownIt as MarkdownItInstance, Token } from 'markdown-it'

import {
  FALLBACK_FENCE_INFO,
  isImageSrc,
  sortMarks,
  marksEqual,
  type TiptapDoc,
  type TiptapMark,
  type TiptapNode,
} from './doc'

// ── Markdown → Tiptap JSON ──────────────────────────────────────────────
//
// 解析器只做「结构翻译」，不做任何业务解析：`[[...]]` 交给调用点通过
// `resolveLink` 决定是 mention 还是 wikiLink。这样这一层不需要认识 Dexie、
// 实体 id 或 vault 布局，可以在 Node 里离线跑全量校验。

/**
 * `[[ ]]` 里解析出来的一份引用。
 *
 * 为什么要带 `raw`：真实 vault 里除了 `[[目标]]`，还有 18 处带锚点的
 * 带锚点、带别名的 `[[ ]]`（实测 18 处）。
 * 锚点（Obsidian 的标题跳转）在我们这套节点属性里没有位置，但如果解析时
 * 把它丢掉，写回就会退化成裸链接 —— 用户的文件被改写，标题跳转也没了。
 * 因此把 `[[ ]]` 内的原文整份带在节点上，写回时原样还原。
 */
export interface LinkRef {
  /** 去掉锚点与别名后的目标（用于解析成实体） */
  target: string
  /** `|` 后面的显示名 */
  alias?: string
  /** `#` 后面的锚点（Obsidian 的标题链接） */
  anchor?: string
  /** `[[ ]]` 内的**完整原文**（目标#锚点|别名） */
  raw: string
}

export interface ResolvedLink {
  type: 'mention' | 'wikiLink'
  attrs: {
    id: string
    label: string
    entityType?: string
    /** 保留 [[ ]] 内的原文，写回时原样还原，保证带锚点/别名的链接不被改写 */
    raw: string
  }
}

export interface MarkdownToTiptapOptions {
  /**
   * 解析成链接节点；返回 null 表示解析不了，会降级为纯文本
   * （用 `alias ?? target` 作为文本，方括号随之消失）。
   */
  resolveLink: (ref: LinkRef) => ResolvedLink | null
}

interface ConvertState {
  resolveLink: MarkdownToTiptapOptions['resolveLink']
  /** 源码按行切好：GFM 表格的分隔行不产生 token，只能按行号回源码取 */
  sourceLines: string[]
}

let cachedParser: MarkdownItInstance | null = null

function getParser(): MarkdownItInstance {
  if (cachedParser === null) {
    cachedParser = new MarkdownIt({
      // html 必须开：vault 正文用 <small> 做小字标注，关掉就只能当纯文本
      html: true,
      // linkify 关：裸 URL 被悄悄变成链接会改变文本语义，而且往返不稳定
      linkify: false,
      typographer: false,
      // breaks 关：软换行由我们自己决定怎么表达，不受这个开关影响
      breaks: false,
    })
  }
  return cachedParser
}

/**
 * Markdown → Tiptap 文档。
 *
 * 若正文里存在兜底块（```oc-document），直接还原其中的 JSON：
 * 那份 JSON 才是完整信息，兜底块之前的可见正文只是「给人看的预览」。
 * 兜底块本身损坏时抛错而不是吞掉 —— 静默吞掉会让用户以为笔记是空的。
 */
export function markdownToTiptap(markdown: string, options: MarkdownToTiptapOptions): TiptapDoc {
  const tokens = getParser().parse(markdown, {})

  const restored = restoreFallback(tokens)
  if (restored !== null) return restored

  const state: ConvertState = {
    resolveLink: options.resolveLink,
    sourceLines: markdown.replace(/\r\n?/g, '\n').split('\n'),
  }
  const content = convertBlocks(tokens, state)

  // ProseMirror 的 doc 要求 block+，空文档必须补一个空段落，否则编辑器会拒绝装载
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

/** 找兜底块并还原；没有则返回 null */
function restoreFallback(tokens: Token[]): TiptapDoc | null {
  for (const token of tokens) {
    if (token.type !== 'fence') continue
    if (token.info.trim() !== FALLBACK_FENCE_INFO) continue

    const raw = token.content.trim()
    if (raw === '') continue

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      throw new Error(
        `${FALLBACK_FENCE_INFO} 兜底块不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${FALLBACK_FENCE_INFO} 兜底块顶层不是对象`)
    }
    const candidate = parsed as { type?: unknown; content?: unknown }
    if (candidate.type !== 'doc' || !Array.isArray(candidate.content)) {
      throw new Error(`${FALLBACK_FENCE_INFO} 兜底块不是合法的 Tiptap 文档（缺少 type:"doc" 或 content 数组）`)
    }
    return parsed as TiptapDoc
  }
  return null
}

/** 找到与 openIndex 处开标签配对的闭标签下标；找不到就返回末尾 */
function findMatchingClose(tokens: Token[], openIndex: number): number {
  const openType = tokens[openIndex].type
  const closeType = openType.replace(/_open$/, '_close')
  let depth = 0
  for (let i = openIndex; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth += 1
    else if (tokens[i].type === closeType) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return tokens.length - 1
}

/**
 * 编辑器 schema 只打算放宽到 1–4 级标题。
 * H5/H6 降级为 H4 而不是丢弃：宁可层级不准，也不能把用户的字吃掉。
 */
function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) return 1
  if (level < 1) return 1
  if (level > 4) return 4
  return Math.floor(level)
}

function convertBlocks(tokens: Token[], state: ConvertState, skipPrefix = 0): TiptapNode[] {
  const out: TiptapNode[] = []
  let index = 0
  // 任务列表标记会出现在本层第一个段落的最前面，只吃掉一次
  let pendingSkip = skipPrefix

  while (index < tokens.length) {
    const token = tokens[index]

    switch (token.type) {
      case 'paragraph_open': {
        const inline = tokens[index + 1]
        const nodes = convertInlineChildren(inline, state, pendingSkip)
        pendingSkip = 0
        // 独占一个段落的图片提升为块级 imageBlock：schema 里没有行内图片节点
        if (nodes.length === 1 && nodes[0].type === 'imageBlock') {
          out.push(nodes[0])
        } else if (nodes.length > 0) {
          out.push({ type: 'paragraph', content: nodes })
        }
        index += 3
        break
      }

      case 'heading_open': {
        const level = clampHeadingLevel(Number.parseInt(token.tag.replace(/^h/, ''), 10))
        const nodes = convertInlineChildren(tokens[index + 1], state, pendingSkip)
        pendingSkip = 0
        out.push({ type: 'heading', attrs: { level }, ...(nodes.length > 0 ? { content: nodes } : {}) })
        index += 3
        break
      }

      case 'blockquote_open': {
        const close = findMatchingClose(tokens, index)
        const inner = convertBlocks(tokens.slice(index + 1, close), state)
        out.push({ type: 'blockquote', content: ensureBlocks(inner) })
        index = close + 1
        break
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const close = findMatchingClose(tokens, index)
        out.push(convertList(tokens, index, close, token.type === 'ordered_list_open', state))
        index = close + 1
        break
      }

      case 'fence':
      case 'code_block': {
        out.push({
          type: 'codeBlock',
          attrs: { language: codeLanguage(token) },
          content: codeText(token) === '' ? [] : [{ type: 'text', text: codeText(token) }],
        })
        index += 1
        break
      }

      case 'hr': {
        out.push({ type: 'horizontalRule' })
        index += 1
        break
      }

      case 'table_open': {
        const close = findMatchingClose(tokens, index)
        const table = convertTable(tokens.slice(index + 1, close), state)
        if (table !== null) {
          const separator = separatorLineOf(token, state.sourceLines)
          if (separator !== null) table.attrs = { rawSeparator: separator }
          out.push(table)
        }
        index = close + 1
        break
      }

      case 'html_block': {
        // 块级 HTML 在 schema 里没有对应节点。保留原文为段落，让它至少可读；
        // 完整性由序列化时的兜底块负责。换行必须拆成硬换行 —— 序列化正是
        // 这样输出文本里的 \n 的，不拆的话这一处「解析→序列化→解析」就不相等。
        const text = token.content.trim()
        if (text !== '') out.push({ type: 'paragraph', content: textNodesWithBreaks(text) })
        index += 1
        break
      }

      default: {
        index += 1
        break
      }
    }
  }

  return out
}

/** 兜底块等的围栏语言：只取第一个词，避免 info 串里的额外参数变成非法 attr */
function codeLanguage(token: Token): string {
  if (token.type !== 'fence') return ''
  const info = token.info.trim()
  if (info === '') return ''
  return info.split(/\s+/)[0]
}

/** 围栏/缩进代码块的正文；markdown-it 的 content 末尾总带一个换行，要去掉 */
function codeText(token: Token): string {
  const raw = token.content
  return raw.endsWith('\n') ? raw.slice(0, -1) : raw
}

function ensureBlocks(nodes: TiptapNode[]): TiptapNode[] {
  return nodes.length > 0 ? nodes : [{ type: 'paragraph' }]
}

interface ListItemConversion {
  blocks: TiptapNode[]
  /** null 表示不是任务项 */
  checked: boolean | null
}

function convertList(
  tokens: Token[],
  openIndex: number,
  closeIndex: number,
  ordered: boolean,
  state: ConvertState,
): TiptapNode {
  const items: ListItemConversion[] = []
  let index = openIndex + 1

  while (index < closeIndex) {
    if (tokens[index].type !== 'list_item_open') {
      index += 1
      continue
    }
    const itemClose = findMatchingClose(tokens, index)
    const inner = tokens.slice(index + 1, itemClose)
    // 任务列表标记只对无序列表有意义（GFM 不允许有序任务列表）
    const marker = ordered ? null : detectTaskMarker(inner)
    items.push({
      blocks: convertBlocks(inner, state, marker === null ? 0 : marker.length),
      checked: marker === null ? null : marker.checked,
    })
    index = itemClose + 1
  }

  const isTaskList = items.some((item) => item.checked !== null)

  if (isTaskList) {
    return {
      type: 'taskList',
      content: items.map((item) => ({
        type: 'taskItem',
        attrs: { checked: item.checked === true },
        content: ensureBlocks(item.blocks),
      })),
    }
  }

  if (ordered) {
    const startRaw = tokens[openIndex].attrGet('start')
    const start = typeof startRaw === 'number' ? startRaw : Number.parseInt(String(startRaw ?? '1'), 10)
    return {
      type: 'orderedList',
      ...(Number.isFinite(start) && start !== 1 ? { attrs: { start } } : {}),
      content: items.map((item) => ({ type: 'listItem', content: ensureBlocks(item.blocks) })),
    }
  }

  return {
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: ensureBlocks(item.blocks) })),
  }
}

/**
 * 识别 `- [ ]` / `- [x]` 前缀。
 * 返回标记的字符长度，好让行内转换把这段字符从首个文本里切掉。
 */
function detectTaskMarker(inner: Token[]): { checked: boolean; length: number } | null {
  const paragraphIndex = inner.findIndex((token) => token.type === 'paragraph_open')
  if (paragraphIndex === -1) return null
  const inline = inner[paragraphIndex + 1]
  if (inline === undefined || inline.type !== 'inline') return null

  // markdown-it 把 `[`、`]` 都当终止符，标记可能被切成多个文本 token，
  // 所以先拼出「开头的连续纯文本」再匹配
  const text = leadingText(inline.children)
  const match = /^\[([ xX])\]\s+/.exec(text)
  if (match === null) return null
  return { checked: match[1].toLowerCase() === 'x', length: match[0].length }
}

function leadingText(children: Token[] | null): string {
  if (children === null) return ''
  let text = ''
  for (const child of children) {
    if (child.type !== 'text') break
    text += child.content
  }
  return text
}

/** thead 的行是 th，tbody 的行是 td —— GFM 表头只能是第一行，见 convertTable */
function convertTable(inner: Token[], state: ConvertState): TiptapNode | null {
  const rows: TiptapNode[] = []
  let index = 0

  while (index < inner.length) {
    if (inner[index].type !== 'tr_open') {
      index += 1
      continue
    }
    const rowClose = findMatchingClose(inner, index)
    const cells: TiptapNode[] = []
    let cursor = index + 1

    while (cursor < rowClose) {
      const cellToken = inner[cursor]
      if (cellToken.type !== 'th_open' && cellToken.type !== 'td_open') {
        cursor += 1
        continue
      }
      const inline = inner[cursor + 1]
      const isHeader = cellToken.type === 'th_open'
      cells.push({
        type: isHeader ? 'tableHeader' : 'tableCell',
        // GFM 表达不了合并单元格与列宽；这里如实写默认值，
        // 序列化时一旦发现不是默认值就会记入「不支持」并触发兜底块
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: 'paragraph', content: convertInlineChildren(inline, state, 0) }],
      })
      cursor += 3
    }

    rows.push({ type: 'tableRow', content: cells })
    index = rowClose + 1
  }

  if (rows.length === 0) return null
  return { type: 'table', content: rows }
}

/**
 * GFM 表格的分隔行（`|------|-----|` 这种）**不产生任何 token** ——
 * markdown-it 的表格规则直接把它消费掉了。所以只能按 `table_open.map` 的行号
 * 回源码里取。它纯属排版风格（多少道横杠、有没有空格），存进
 * `attrs.rawSeparator` 交给写回原样还原。
 *
 * 注意：这个属性要被编辑器保留，需要在 Table 扩展上声明它；
 * 否则 ProseMirror 装载文档时会丢掉未知属性，分隔行会退回规范形式。
 */
function separatorLineOf(token: Token, sourceLines: string[]): string | null {
  const startLine = token.map?.[0]
  if (startLine === undefined) return null
  const line = sourceLines[startLine + 1]
  if (line === undefined) return null
  const trimmed = line.trim()
  if (!trimmed.includes('-')) return null
  if (!/^[\s|:-]+$/.test(trimmed)) return null
  return trimmed
}

/** 行内标签：`<small>` / `<u>` 映射为标记，`<br>` 映射为硬换行 */
type PairedInlineTag = 'small' | 'underline'

function pairedTagOf(content: string): { tag: PairedInlineTag; closing: boolean } | null {
  const match = /^<\s*(\/?)\s*(small|u)\s*>$/i.exec(content.trim())
  if (match === null) return null
  return { tag: match[2].toLowerCase() as PairedInlineTag, closing: match[1] === '/' }
}

function isBreakTag(content: string): boolean {
  return /^<\s*br\s*\/?\s*>$/i.test(content.trim())
}

function convertInlineChildren(
  inline: Token | undefined,
  state: ConvertState,
  skipPrefix: number,
): TiptapNode[] {
  if (inline === undefined || inline.children === null) return []

  const out: TiptapNode[] = []
  const marks: TiptapMark[] = []
  /**
   * 标记开合栈。null 表示「这一层是同类型的重复标记，被忽略了」。
   *
   * markdown 允许 `****a****` 这类同类型嵌套（markdown-it 会解析成 strong 套
   * strong），但 ProseMirror 的文本节点不能同时带两个 bold —— 留着重复标记
   * 会让「解析→序列化→解析」永远不收敛。所以要按栈精确配对，闭合时不能误弹外层。
   */
  const frames: (TiptapMark | null)[] = []
  let remainingSkip = skipPrefix

  const openMark = (mark: TiptapMark): void => {
    if (marks.some((item) => item.type === mark.type)) {
      frames.push(null)
      return
    }
    marks.push(mark)
    frames.push(mark)
  }

  const closeMark = (): void => {
    const frame = frames.pop()
    if (frame === null || frame === undefined) return
    const index = marks.findIndex((item) => item.type === frame.type)
    if (index !== -1) marks.splice(index, 1)
  }

  /**
   * 文本里的换行拆成硬换行，并按 markdown 段落续行的语义收敛每行首尾空白。
   * 序列化时正是把文本里的 \n 输出成硬换行的；而续行行首的空白解析时本就会
   * 被吃掉（首行除外），不在这里一起收敛，「解析→序列化→解析」就会漂移。
   */
  const pushText = (text: string): void => {
    text.split('\n').forEach((rawSegment, index) => {
      if (index > 0) out.push({ type: 'hardBreak' })
      const segment = (index > 0 ? rawSegment.replace(/^[ \t]+/, '') : rawSegment).replace(/[ \t]+$/, '')
      if (segment === '') return
      out.push(marks.length > 0 ? { type: 'text', text: segment, marks: sortMarks(marks) } : { type: 'text', text: segment })
    })
  }

  for (const child of inline.children) {
    switch (child.type) {
      case 'text': {
        let text = child.content
        if (remainingSkip > 0) {
          if (text.length <= remainingSkip) {
            remainingSkip -= text.length
            text = ''
          } else {
            text = text.slice(remainingSkip)
            remainingSkip = 0
          }
        }
        out.push(...splitWikiLinks(text, state, marks))
        break
      }

      case 'code_inline': {
        out.push({ type: 'text', text: child.content, marks: sortMarks([...marks, { type: 'code' }]) })
        break
      }

      case 'strong_open':
        openMark({ type: 'bold' })
        break
      case 'strong_close':
        closeMark()
        break
      case 'em_open':
        openMark({ type: 'italic' })
        break
      case 'em_close':
        closeMark()
        break
      case 's_open':
        openMark({ type: 'strike' })
        break
      case 's_close':
        closeMark()
        break

      case 'link_open': {
        const href = child.attrGet('href')
        const title = child.attrGet('title')
        // markdown 链接只能承载 href；title 表达不了，交给兜底块保完整性
        openMark({
          type: 'link',
          attrs: { href: typeof href === 'string' ? href : '', title: title ?? null },
        })
        break
      }
      case 'link_close':
        closeMark()
        break

      // markdown 的软换行在 Obsidian 里是按换行显示的（严格换行默认关闭），
      // 所以按硬换行还原，才能保住用户看到的断行
      case 'softbreak':
      case 'hardbreak':
        out.push({ type: 'hardBreak' })
        break

      case 'html_inline': {
        const paired = pairedTagOf(child.content)
        if (paired !== null) {
          if (paired.closing) closeMark()
          else openMark({ type: paired.tag })
          break
        }
        if (isBreakTag(child.content)) {
          out.push({ type: 'hardBreak' })
          break
        }
        // 其它行内 HTML 没有对应节点：原样当文本留着，至少不丢字
        pushText(child.content)
        break
      }

      case 'image': {
        const src = child.attrGet('src')
        const alt = child.content
        if (typeof src === 'string' && src !== '') {
          out.push({ type: 'imageBlock', attrs: { src, width: null } })
        } else {
          pushText(alt)
        }
        break
      }

      default:
        // 未知行内 token：有内容就留着，没有就跳过
        if (child.content !== '') pushText(child.content)
        break
    }
  }

  return normalizeInline(out)
}

/**
 * 把一段纯文本里的 `[[...]]` 切成链接节点与普通文本。
 *
 * 锚点（`#`）与别名（`|`）都会被完整解析进 `LinkRef`，并由调用点带回的
 * `attrs.raw` 原样保留 —— 于是带锚点的链接往返之后仍是它自己。
 *
 * 只有 `![[非图片]]` 嵌入不当作链接：schema 里没有嵌入节点，保留原始文本
 * 反而不会丢东西。
 */
function splitWikiLinks(
  text: string,
  state: ConvertState,
  marks: readonly TiptapMark[],
): TiptapNode[] {
  if (text === '') return []

  /** `[[目标]]`、`[[目标|别名]]`、`[[目标#锚点|别名]]`、`![[目标]]` 一次匹配 */
  const linkPattern = /(!?)\[\[([^[\]\n]+?)\]\]/g
  const nodes: TiptapNode[] = []
  const markList = marks.length > 0 ? sortMarks(marks) : null

  const pushPlain = (value: string): void => {
    if (value === '') return
    nodes.push(markList === null ? { type: 'text', text: value } : { type: 'text', text: value, marks: markList })
  }

  let cursor = 0
  let match = linkPattern.exec(text)

  while (match !== null) {
    const raw = match[0]
    const isEmbed = match[1] === '!'
    const inner = match[2]
    const start = match.index

    if (isEmbed) {
      pushPlain(text.slice(cursor, start))
      if (isImageSrc(inner)) {
        nodes.push({ type: 'imageBlock', attrs: { src: inner.trim(), width: null } })
      } else {
        pushPlain(raw)
      }
      cursor = start + raw.length
      match = linkPattern.exec(text)
      continue
    }

    const ref = parseLinkRef(inner)
    const resolved = state.resolveLink(ref)
    pushPlain(text.slice(cursor, start))

    if (resolved === null) {
      // 按约定降级为纯文本。显示名取 `alias ?? target`；
      // 两者都为空时（Obsidian 的 `[[#标题]]`，指向本文件的某个标题）
      // 没有可用的显示名，这时保留 `[[ ]]` 原文 —— 总比把这一段直接抹掉强。
      const display = ref.alias ?? (ref.target === '' ? undefined : ref.target)
      pushPlain(display ?? raw)
    } else {
      // raw 由调用点带回；万一漏了就用我们自己解析出来的，保证不被改写
      const attrs = { ...resolved.attrs, raw: resolved.attrs.raw ?? ref.raw }
      nodes.push(
        markList === null
          ? { type: resolved.type, attrs }
          : { type: resolved.type, attrs, marks: markList },
      )
    }

    cursor = start + raw.length
    match = linkPattern.exec(text)
  }

  pushPlain(text.slice(cursor))
  return nodes
}

/** 把 `[[ ]]` 内的原文拆成目标 / 别名 / 锚点。`raw` 逐字原样，不做 trim */
function parseLinkRef(inner: string): LinkRef {
  const pipe = inner.indexOf('|')
  const beforePipe = pipe === -1 ? inner : inner.slice(0, pipe)
  const aliasRaw = pipe === -1 ? undefined : inner.slice(pipe + 1)
  const hash = beforePipe.indexOf('#')
  const anchorRaw = hash === -1 ? undefined : beforePipe.slice(hash + 1)

  return {
    target: (hash === -1 ? beforePipe : beforePipe.slice(0, hash)).trim(),
    alias: aliasRaw === undefined || aliasRaw === '' ? undefined : aliasRaw,
    anchor: anchorRaw === undefined || anchorRaw === '' ? undefined : anchorRaw,
    raw: inner,
  }
}

/**
 * 把带换行的纯文本拆成「文本 + 硬换行」的行内序列（块级 HTML 的原文走这里）。
 * 续行行首的缩进要收敛：markdown 解析段落续行时本就会吃掉它，
 * 不收敛的话「解析→序列化→解析」在这些行上不相等。
 * 行尾空白**不**动 —— 它与写回侧的规则保持一致，动了反而丢内容。
 */
function textNodesWithBreaks(text: string): TiptapNode[] {
  const out: TiptapNode[] = []
  text.split('\n').forEach((rawLine, index) => {
    if (index > 0) out.push({ type: 'hardBreak' })
    const line = index > 0 ? rawLine.replace(/^[ \t]+/, '') : rawLine
    if (line !== '') out.push({ type: 'text', text: line })
  })
  return out
}

/**
 * 归一化行内序列。
 *
 * 合并相邻的同标记文本节点是**必须的**，不是美化：`**a**` 紧挨 `**b**`
 * 序列化出来是 `**a****b**`，而实测 markdown-it 会把它解析成**一个**
 * strong（内容 `a****b`）。不合并的话「解析→序列化→解析」就不再相等。
 * 顺带丢掉空文本节点（markdown-it 在 strong 前后会产出空文本 token）。
 */
function normalizeInline(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.text ?? ''
      if (text === '') continue
      const prev = out[out.length - 1]
      if (prev !== undefined && prev.type === 'text' && marksEqual(prev.marks, node.marks)) {
        prev.text = `${prev.text ?? ''}${node.text ?? ''}`
        continue
      }
    }
    out.push(node)
  }
  // 行尾的硬换行没有意义：序列化时它会被块之间的空行吞掉，
  // 留着会让「解析→序列化→解析」不相等。统一在解析侧就去掉。
  while (out.length > 0 && out[out.length - 1].type === 'hardBreak') out.pop()
  return out
}
