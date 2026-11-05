/**
 * 「笔记类模板」判定 —— 分类 / 词条能真正渲染的模板。
 *
 * 2026-11-06 起，**十一个组件在笔记宿主上都实装了**（标题 / 头像 / 图片 / 画廊 /
 * 时间 / 地点 / 简介 / 关系 / 标签 / 封面 / 正文）：词条行新增了 `avatar` / `image` /
 * `gallery` / `time` / `endTime` / `location` 六列，关系由 `parentId` 与正文引用派生。
 * 于是「笔记类模板」不再是「只支持五个组件的模板」，而只是「含正文的模板」——
 * 实体模板（角色 / 事件 / 国家）复制到分类里也能正常渲染每一块。
 *
 * 纯函数，脚本和 UI 共用。
 */
import { COMPONENT_IDS } from './registry'
import type { TemplateComponentId, TemplateDoc } from './types'

/** 笔记渲染路径真正画得出来的组件：现在是全部（保留这个名字，别处按它过滤） */
export const NOTE_COMPONENT_IDS: TemplateComponentId[] = [...COMPONENT_IDS]

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
