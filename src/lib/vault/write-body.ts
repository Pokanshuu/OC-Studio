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
import { markdownToTiptap } from './markdown/to-tiptap'
import { getVaultSession } from './vault-session'

/** 没有会话时（浏览器 Mock、脚本）只做纯文本级解析 */
const FALLBACK_RESOLVER = () => null

export function bodyDocFromMarkdown(markdown: string): unknown {
  const session = getVaultSession()
  const resolveLink = session === null ? FALLBACK_RESOLVER : createLinkResolver(session.index)
  return markdownToTiptap(markdown, { resolveLink })
}
