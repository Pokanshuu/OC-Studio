import type { WikiLink } from './types'

// ── [[ ]] 链接的提取与解析键归一化 ───────────────────────────────────────
// 实测的 vault 约定：
//   `[[文件名]]` —— 目标是**纯文件名**（不带路径、不带 .md），
//   不是我在方案初稿里假设的 [[路径|显示名]]。因此解析键就是文件名或别名。

const WIKILINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g

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
    const inner = m[2]

    const pipe = inner.indexOf('|')
    const targetPart = pipe >= 0 ? inner.slice(0, pipe) : inner
    const aliasPart = pipe >= 0 ? inner.slice(pipe + 1).trim() : ''

    // [[目标#锚点]]：锚点不属于实体标识
    const hash = targetPart.indexOf('#')
    const target = (hash >= 0 ? targetPart.slice(0, hash) : targetPart).trim()
    if (target === '') continue

    out.push({
      target,
      alias: aliasPart === '' ? undefined : aliasPart,
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
