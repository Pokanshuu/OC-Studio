/**
 * Markdown → 实体正文（编辑器文档）。写入侧的**唯一**入口。
 *
 * 为什么不能直接 `JSON.parse` 或者拼段落：vault 的正文是 Tiptap 文档，而
 * Markdown 桥要把 `[[词条]]` / `![[图]]` 解析成带 id 的节点。解析器就是装载时
 * 用的那一个（`createLinkResolver`），索引留在会话上（`VaultSession.index`）。
 *
 * 解析不了的目标**不报错**：桥会把它降级成纯文本（方括号消失），照样能存。
 * 这比拒绝写入好 —— 模型写坏一条链接不该让整次保存失败。
 */
import { createLinkResolver } from './markdown-bridge'
import { markdownToTiptap, type LinkRef, type ResolvedLink } from './markdown/to-tiptap'
import { getVaultSession } from './vault-session'

/** 没有会话时（浏览器 Mock、脚本）只做纯文本级解析 */
const FALLBACK_RESOLVER = () => null

export interface BodyDocOptions {
  /**
   * 指向**还不存在的条目**的链接怎么处理。
   *
   * 默认（写正文）是降级成纯文本：正文里的死链没有意义，方括号消失即可。
   * `'keep'` 用于**模板的正文预设** —— 骨架里先写 `[[主角]]`、条目以后再建是正常用法，
   * 方括号不能丢（丢了就再也认不出那是条链接）。
   */
  unresolvedLinks?: 'drop' | 'keep'
}

/** 库外 / 未建的链接：留一个「有原文、没目标」的节点（原文能逐字还原，点不动） */
function keepUnresolved(ref: LinkRef): ResolvedLink | null {
  if (ref.target === '') return null
  return { type: 'wikiLink', attrs: { id: '', label: ref.alias ?? ref.target, raw: ref.raw } }
}

export function bodyDocFromMarkdown(markdown: string, options: BodyDocOptions = {}): unknown {
  const session = getVaultSession()
  const base = session === null ? FALLBACK_RESOLVER : createLinkResolver(session.index)
  const resolveLink =
    options.unresolvedLinks === 'keep'
      ? (ref: LinkRef): ResolvedLink | null => base(ref) ?? keepUnresolved(ref)
      : base
  return markdownToTiptap(markdown, { resolveLink })
}
