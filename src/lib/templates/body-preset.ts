/**
 * 正文组件 → 新建条目时铺进正文的那份骨架。
 *
 * 模板只记**选择**（`body.params.group = <id>`），骨架本身在正文组件里
 * （`lib/templates/body-groups.ts`，存 `.ocstudio/body-groups.json`）——
 * 与「基本信息组件」同一套设计：组件独立、可复用、名字与模板名无关。
 *
 * 存的是 **Markdown**：库文件可读、可手改、随库走。铺进去时才转成编辑器文档，
 * 与助手写正文、语料导回共用同一个解析器（`bodyDocFromMarkdown`）。
 */
import { createLinkSerializer } from '@/lib/vault/markdown-bridge'
import { tiptapToMarkdown } from '@/lib/vault/markdown/to-markdown'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'
import {
  defaultBodyGroupIdOfTemplate,
  findBodyGroup,
  getBodyGroups,
  loadBodyGroups,
  type BodyGroup,
} from './body-groups'
import { findTemplateByName, getTemplates, loadTemplates } from './store'
import type { TemplateDoc } from './types'

/** 正文组件在模板里的参数键 */
export const BODY_GROUP_KEY = 'group'
/** 旧版把 Markdown 直接塞在模板里（`body.params.preset`）：只读兼容，不再写 */
export const LEGACY_BODY_PRESET_KEY = 'preset'

/** 模板里有没有正文组件（含被关掉的：关掉再打开不该把选择弄丢） */
export function hasBodyComponent(doc: TemplateDoc): boolean {
  return doc.components.some((component) => component.id === 'body')
}

/** 按 id / 名字 / 别名找模板（笔记里的 `模板:` 存的是名字） */
function resolveTemplate(templateId: string | null | undefined): TemplateDoc | undefined {
  const target = (templateId ?? '').trim()
  if (!target) return undefined
  return getTemplates().find((doc) => doc.id === target) ?? findTemplateByName(target)
}

function bodyParamsOf(doc: TemplateDoc | undefined): Record<string, unknown> {
  const component = doc?.components.find((item) => item.id === 'body')
  return component?.params ?? {}
}

/** 模板选中的正文组件 id；没选 / 选到已删除的 → 默认组件 */
export function bodyGroupIdOfTemplate(templateId: string | null | undefined): string {
  const target = (templateId ?? '').trim()
  const params = bodyParamsOf(resolveTemplate(target))
  const selected = typeof params[BODY_GROUP_KEY] === 'string' ? (params[BODY_GROUP_KEY] as string).trim() : ''
  if (selected !== '' && findBodyGroup(selected)) return selected
  return defaultBodyGroupIdOfTemplate(target)
}

/**
 * 模板的正文组件。旧数据把 Markdown 内联在模板里（`body.params.preset`）时，
 * 包成一份**匿名组件**返回，让上层不必区分两种来源。
 */
export function bodyGroupOfTemplate(templateId: string | null | undefined): BodyGroup | null {
  const target = (templateId ?? '').trim()
  const doc = resolveTemplate(target)
  const params = bodyParamsOf(doc)
  const selected = typeof params[BODY_GROUP_KEY] === 'string' ? (params[BODY_GROUP_KEY] as string).trim() : ''
  if (selected !== '') {
    const group = findBodyGroup(selected)
    if (group) return group
  }
  const legacy = typeof params[LEGACY_BODY_PRESET_KEY] === 'string' ? (params[LEGACY_BODY_PRESET_KEY] as string) : ''
  if (legacy.trim() !== '') {
    return { id: `${target}:legacy`, name: '（旧的内联预设）', markdown: legacy }
  }
  return findBodyGroup(defaultBodyGroupIdOfTemplate(target)) ?? null
}

/** 预设 Markdown（没选 / 组件是空的 → 空串） */
export function bodyPresetMarkdown(templateId: string | null | undefined): string {
  return bodyGroupOfTemplate(templateId)?.markdown.trim() ?? ''
}

/** 某个正文组件有没有骨架（列表里显示「已设」用） */
export function bodyGroupHasPreset(group: BodyGroup): boolean {
  return group.markdown.trim() !== ''
}

/** 正文组件列表（模板选择器 / 设置面板共用同一份快照） */
export function bodyGroupsSnapshot(): BodyGroup[] {
  return getBodyGroups()
}

/**
 * 新建条目时用：预设 → Tiptap 文档。没有预设 / 只有空白时返回 `null`
 * （调用方就别往 `document` 里写东西，空文档和没写是两回事）。
 */
export async function bodyPresetDoc(templateId: string | null | undefined): Promise<unknown | null> {
  // 新建可能发生在组件表还没装载完的时候（冷启动第一件事就是新建）
  await Promise.all([loadTemplates(), loadBodyGroups()])
  const markdown = bodyPresetMarkdown(templateId)
  if (!markdown) return null
  // 与助手写正文、语料导回共用同一个解析器；`unresolvedLinks: 'keep'` 保住「指向还没建的条目」
  // 的方括号（骨架里写 `[[主角]]` 是正常用法）
  const doc = bodyDocFromMarkdown(markdown, { unresolvedLinks: 'keep' })
  return hasDocContent(doc) ? doc : null
}

/** 编辑器文档 → 预设 Markdown（保存用）。空文档 → 空串，等于这份组件没骨架 */
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
