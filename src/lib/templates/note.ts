/**
 * 「笔记类模板」判定 —— 分类 / 词条能真正渲染的模板。
 *
 * 2026-11-06 起，**组件在笔记宿主上都实装了**（标题 / 头像 / 图片 / 画廊 /
 * 简介 / 关系 / 标签 / 封面 / 正文）：词条行有 `avatar` / `image` / `gallery` /
 * `time` / `endTime` / `location` 六列，关系由 `parentId` 与正文引用派生。
 * 时间 / 地点 2026-11-10 并回「基本信息」的字段行（值仍写后三列）。
 * 于是「笔记类模板」不再是「只支持五个组件的模板」，而只是「含正文的模板」——
 * 实体模板（角色 / 事件 / 国家）复制到分类里也能正常渲染每一块。
 *
 * 纯函数，脚本和 UI 共用。
 */
import { COMPONENT_IDS } from './registry'
import type { TemplateComponentId, TemplateDoc } from './types'

/**
 * 笔记渲染路径真正画得出来的组件。
 *
 * 立绘（`avatars`）与动画（`animation`）是**角色专属列**，笔记宿主没有对应的槽位，
 * 所以不在这里 —— 含这两个组件的模板不是笔记模板（分类绑定时不会出现）。
 */
export const NOTE_COMPONENT_IDS: TemplateComponentId[] = COMPONENT_IDS.filter(
  (id) => id !== 'portrait' && id !== 'animation',
)

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

/**
 * 实体模板：角色 / 事件 / 国家。它们有自己的强类型列和专用编辑器，
 * **不在「这篇用哪个模板」的候选里** —— 摆到笔记上只会渲染出一堆空行
 * （字段读实体列，`WorldEntry.custom` 里没有这些键）。
 */
export const ENTITY_TEMPLATE_IDS = ['character', 'event', 'country'] as const

export function isEntityTemplate(doc: TemplateDoc): boolean {
  return (ENTITY_TEMPLATE_IDS as readonly string[]).includes(doc.id)
}

/**
 * 单篇覆盖的候选：笔记型模板，排除三个实体模板。
 * 词条编辑器与分类条目编辑器共用这一份，别各写各的过滤条件。
 */
export function perNoteTemplates(templates: TemplateDoc[]): TemplateDoc[] {
  return templates.filter((doc) => !isEntityTemplate(doc) && isNoteTemplate(doc))
}

/**
 * 按 id / 名字 / 旧名找一条**可作单篇覆盖**的模板。
 *
 * 不合法（实体模板、不存在、没正文）一律返回 `undefined` —— 调用方据此回落到
 * 「分类绑定 → 内置词条模板」。这也顺手接住了老数据：上一版按钮曾把实体模板写进
 * `WorldEntry.template`，那些单篇覆盖从此被忽略，不会再把笔记渲染成角色页。
 */
export function perNoteTemplateByName(
  templates: TemplateDoc[],
  name: string | null | undefined,
): TemplateDoc | undefined {
  const target = name?.trim()
  if (!target) return undefined
  const found = templates.find(
    (doc) => doc.id === target || doc.name === target || doc.aliases.includes(target),
  )
  return found && !isEntityTemplate(found) && isNoteTemplate(found) ? found : undefined
}
