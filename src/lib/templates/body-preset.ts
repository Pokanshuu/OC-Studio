/**
 * 正文组件的「预设段落」—— 新建条目时铺进正文的那份骨架。
 *
 * 存的是 **Markdown**（`body.params.preset`，写进 `.ocstudio/templates/<id>.md` 的
 * frontmatter）：模板文件要能读、能手改、能跟着库一起分享。用的时候转成编辑器文档
 * （`bodyDocFromMarkdown`，和助手写正文、导回笔记走的是同一个解析器），
 * 这样 `[[词条]]` 之类的链接在铺进去时就已经是带 id 的节点。
 *
 * **只读「含正文的模板」**：没有正文组件的模板给了预设也没地方放，这里直接当没有。
 * 预设为空 = 不铺（新建的正文仍然是空的，别塞一堆空段落）。
 */
import { createLinkSerializer } from '@/lib/vault/markdown-bridge'
import { tiptapToMarkdown } from '@/lib/vault/markdown/to-markdown'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'
import { getTemplates, loadTemplates, findTemplateByName } from './store'
import type { TemplateDoc } from './types'

/** 正文组件里存预设的键（`docs/模板.md §6.10`） */
export const BODY_PRESET_KEY = 'preset'

/** 模板里有没有正文组件（含被关掉的：关掉再打开不该把预设弄丢） */
export function hasBodyComponent(doc: TemplateDoc): boolean {
  return doc.components.some((component) => component.id === 'body')
}

/** 按 id / 名字 / 别名找模板（笔记里的 `模板:` 存的是名字） */
function resolveTemplate(templateId: string | null | undefined): TemplateDoc | undefined {
  const target = (templateId ?? '').trim()
  if (!target) return undefined
  return getTemplates().find((doc) => doc.id === target) ?? findTemplateByName(target)
}

/** 预设 Markdown（没设 / 只有空白 → 空串） */
export function bodyPresetMarkdown(templateId: string | null | undefined): string {
  const doc = resolveTemplate(templateId)
  if (!doc || !hasBodyComponent(doc)) return ''
  const value = doc.components.find((component) => component.id === 'body')?.params?.[BODY_PRESET_KEY]
  return typeof value === 'string' ? value.trim() : ''
}

/** 模板有没有预设（设置面板里显示「已设」用，不必解成文档） */
export function hasBodyPreset(templateId: string | null | undefined): boolean {
  return bodyPresetMarkdown(templateId) !== ''
}

/**
 * 新建条目时用：预设 → Tiptap 文档。没有预设 / 只有空白时返回 `null`
 * （调用方就别往 `document` 里写东西，空文档和没写是两回事）。
 */
export async function bodyPresetDoc(templateId: string | null | undefined): Promise<unknown | null> {
  // 新建可能发生在模板还没装载完的时候（冷启动第一件事就是新建）
  await loadTemplates()
  const markdown = bodyPresetMarkdown(templateId)
  if (!markdown) return null
  // 与助手写正文、语料导回共用同一个解析器；`unresolvedLinks: 'keep'` 保住「指向还没建的条目」
  // 的方括号（骨架里写 `[[主角]]` 是正常用法）
  const doc = bodyDocFromMarkdown(markdown, { unresolvedLinks: 'keep' })
  return hasDocContent(doc) ? doc : null
}

/** 编辑器文档 → 预设 Markdown（保存用）。空文档 → 空串，等于删掉预设 */
export function bodyPresetFromDoc(doc: unknown): string {
  // 不解析 id → 名字：预设是骨架，里面允许出现**还没建的**条目（`[[主角]]`）。
  // 序列化器优先用节点上的 `raw`（逐字还原），没有 raw 就按显示名拼，
  // 两边都不会把它降级成纯文本。
  const result = tiptapToMarkdown(doc, { serializeLink: createLinkSerializer(() => undefined) })
  return result.markdown.trim()
}

/** 文档里有没有真内容（空 doc / 一个空段落 = 没有） */
function hasDocContent(doc: unknown): boolean {
  if (doc === null || typeof doc !== 'object') return false
  const content = (doc as { content?: unknown }).content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.some((node) => {
    if (node === null || typeof node !== 'object') return false
    const record = node as { type?: unknown; content?: unknown; text?: unknown }
    if (record.type === 'text') return typeof record.text === 'string' && record.text.trim() !== ''
    if (Array.isArray(record.content)) return hasDocContent({ content: record.content })
    // 图片 / 分割线 / 表格这类没有文字也算内容
    return record.type !== 'paragraph'
  })
}
