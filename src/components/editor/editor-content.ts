import { createNodeFromContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { readStoredBody, type LegacyBodySections } from '@/lib/body-content'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'
import { legacyBodyHtml } from '@/lib/vault/markdown/to-tiptap'

/** Normalize once at the load boundary. Existing document nodes are never reparsed as Markdown. */
export function editorContentOf(value: unknown, schema?: () => Schema): object | string {
  const body = readStoredBody(value)
  if (body === null) return ''
  if (typeof body === 'object') {
    if (body.type === 'doc' || body.format !== 'legacy-body-sections') return body
    if (!schema) throw new Error('旧分段正文需要编辑器 schema 才能装载')
    if (!Array.isArray(body.sections) || body.sections.some((section: unknown) =>
      section === null || typeof section !== 'object' || typeof (section as { content?: unknown }).content !== 'string',
    )) throw new Error('旧分段正文格式不正确，已停止装载')
    const content: object[] = []
    for (const section of (body as unknown as LegacyBodySections).sections) {
      if (section.heading) content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] })
      const fragment = editorContentOf(section.content)
      const document = typeof fragment === 'string'
        ? createNodeFromContent(fragment, schema(), { slice: false }).toJSON()
        : fragment
      const nodes = (document as { content?: object[] }).content
      if (Array.isArray(nodes)) content.push(...nodes)
    }
    return { type: 'doc', content }
  }
  if (body.trim() === '') return body
  const html = legacyBodyHtml(body)
  if (html !== null) return html
  return bodyDocFromMarkdown(body, { unresolvedLinks: 'keep' }) as object
}
