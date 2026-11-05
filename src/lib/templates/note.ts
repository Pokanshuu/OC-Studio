/**
 * 「笔记类模板」判定 —— 分类条目（`worldEntries`）能真正渲染的模板。
 *
 * 分类条目只有标题 / 标签 / 简介 / 正文四块数据；模板里如果配了封面、关系、画廊，
 * 这些组件在 `CategoryEntryEditor` 里只会返回 `null`。与其让用户选到一个「看起来
 * 有封面、实际什么都没有」的模板，不如在这里把选择面收窄。
 *
 * 纯函数，脚本和 UI 共用。
 */
import type { TemplateComponentId, TemplateDoc } from './types'

const NOTE_COMPONENT_IDS: TemplateComponentId[] = ['cover', 'info', 'tags', 'summary', 'body']

export function isNoteTemplate(doc: TemplateDoc): boolean {
  const enabled = doc.components.filter((component) => component.enabled)
  if (enabled.length === 0) return false
  if (!enabled.some((component) => component.id === 'body')) return false
  return enabled.every((component) => NOTE_COMPONENT_IDS.includes(component.id))
}

/** 分类可选模板：保留当前已绑定的那条，避免旧分类打开后被悄悄改掉 */
export function noteTemplates(templates: TemplateDoc[], currentId?: string): TemplateDoc[] {
  const out = templates.filter((doc) => isNoteTemplate(doc))
  if (currentId !== undefined && !out.some((doc) => doc.id === currentId)) {
    const current = templates.find((doc) => doc.id === currentId)
    if (current) out.unshift(current)
  }
  return out
}
