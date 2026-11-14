import type { WikiLink } from './types'

// ── [[ ]] 链接的提取与解析键归一化 ───────────────────────────────────────
// 实测的 vault 约定：
//   `[[文件名]]` —— 目标是**纯文件名**（不带路径、不带 .md），
//   不是我在方案初稿里假设的 [[路径|显示名]]。因此解析键就是文件名或别名。

const WIKILINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g

/** `[[ ]]` 内部的三个组成部分（Obsidian 语法：`目标#锚点|别名`） */
export interface WikiLinkInner {
  /** 去掉锚点与别名后的目标；`[[#标题]]` 这种就地锚点为空串 */
  target: string
  /** `#` 后面的锚点（标题跳转）；没有就是 undefined */
  anchor?: string
  /** `|` 后面的显示名；没有就是 undefined */
  alias?: string
}

/**
 * 解析 `[[ ]]` 内部原文。
 *
 * 与 `markdown/to-tiptap.ts` 的解析规则**必须一致**：那边负责读文件，
 * 这里给「导入重绑定 / 序列化」复用 —— 两边各写一份迟早会漂
 * （漂了的表现是「读进来带锚点、写回去锚点没了」，或者反过来）。
 */
export function parseWikiLinkInner(inner: string): WikiLinkInner {
  const pipe = inner.indexOf('|')
  const beforePipe = pipe === -1 ? inner : inner.slice(0, pipe)
  const aliasRaw = pipe === -1 ? undefined : inner.slice(pipe + 1)
  const hash = beforePipe.indexOf('#')
  const anchorRaw = hash === -1 ? undefined : beforePipe.slice(hash + 1)
  const target = (hash === -1 ? beforePipe : beforePipe.slice(0, hash)).trim()
  return {
    target,
    ...(anchorRaw === undefined || anchorRaw === '' ? {} : { anchor: anchorRaw }),
    ...(aliasRaw === undefined || aliasRaw === '' ? {} : { alias: aliasRaw }),
  }
}

/** 去掉围栏代码块与行内代码，避免把代码示例里的 [[ ]] 当成链接 */
export function stripCodeSpans(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

/** 提取正文里的全部 [[ ]] 链接（含 ![[ ]] 嵌入，用 embed 区分） */
export function extractWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = []
  for (const m of stripCodeSpans(body).matchAll(WIKILINK_RE)) {
    const raw = m[0]
    const embed = m[1] === '!'
    const parts = parseWikiLinkInner(m[2])
    if (parts.target === '') continue
    const alias = parts.alias?.trim()
    out.push({
      target: parts.target,
      alias: alias === undefined || alias === '' ? undefined : alias,
      raw,
      embed,
    })
  }
  return out
}

/**
 * 链接解析键：大小写不敏感 + NFKC 归一（全角/半角、兼容字符统一）+ 折叠空白。
 * Obsidian 的链接解析同样是大小写不敏感的，这里对齐它的行为。
 */
export function normalizeLinkKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 去掉开头的「NN.」序号前缀（vault 用 00./10./20. 这类前缀维持目录排序） */
export function stripOrderPrefix(name: string): { order: number | null; label: string } {
  const m = /^(\d+)[.、_\-]\s*(.*)$/.exec(name)
  if (!m) return { order: null, label: name }
  const order = Number.parseInt(m[1], 10)
  const label = m[2].trim()
  return { order: Number.isNaN(order) ? null : order, label: label === '' ? name : label }
}
