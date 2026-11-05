/**
 * 阶段一「哪些组件真的接线了」——**唯一登记处**（同时是各宿主的可选组件表）。
 *
 * 为什么要这张表：模板能配的组件是闭集，但渲染循环是一个宿主一个宿主接的。
 * 如果设置里让用户关掉一个「还没接线」的组件，它会毫无反应 —— 那正是
 * `docs/模板.md §14` 里点名的「配了没反应的组件」。所以这里登记真实进度：
 *
 * - 实体模板（角色 / 事件 / 国家）只有它们**真有数据列**的组件：这个列表既是
 *   「已接线」，也是「添加组件」菜单的候选 —— 宿主根本存不住的东西不出现在列表里
 * - **笔记宿主**（内置词条 / 宠物 / 武器 + 自建模板）走同一套渲染路径，
 *   十一个组件全部实装，见 `note.ts` 的 `NOTE_COMPONENT_IDS`
 * - `npm run audit:templates` 会检查这里列出的 id 都真实存在于组件登记表
 *
 * **接完一个宿主就更新这张表**，否则界面上的进度会撒谎。
 */
import { NOTE_COMPONENT_IDS } from './note'
import type { TemplateComponentId } from './types'

export type TemplateHost = 'character' | 'event' | 'country' | 'note'

/** 实体宿主：只列它们真有强类型列的组件（不存在的连「添加」入口都不给） */
export const WIRED_BY_TEMPLATE: Record<string, TemplateComponentId[]> = {
  // 角色：封面 / 头像 / 名称+字段+立绘 / 关系 / 标签 / 相册 / 简介 / 正文
  character: ['cover', 'avatar', 'info', 'relations', 'tags', 'gallery', 'summary', 'body'],
  // 事件：封面 / 基本信息 / 时间 / 地点 / 简介 / 关系 / 标签 / 图片 / 正文
  event: ['cover', 'info', 'time', 'place', 'summary', 'relations', 'tags', 'gallery', 'body'],
  // 国家：封面 + 旗帜 / 头像（旗帜）/ 名称 / 关系 / 标签 / 画廊 / 简介 / 正文
  country: ['cover', 'avatar', 'info', 'relations', 'tags', 'gallery', 'summary', 'body'],
}

/**
 * 模板 → 宿主。三个内置实体模板有各自的编辑器；**其余（含自建）一律是笔记宿主** ——
 * 它们只会在分类条目 / 词条编辑器里渲染。
 */
export function templateHostOf(templateId: string): TemplateHost {
  if (templateId === 'character' || templateId === 'event' || templateId === 'country') return templateId
  return 'note'
}

/**
 * 这个宿主能用的组件（顺序也是「添加组件」菜单的顺序）。
 * 没有登记项的模板（内置词条 / 宠物 / 武器 / 自建）就是 `NOTE_COMPONENT_IDS`。
 */
export function availableComponents(templateId: string): TemplateComponentId[] {
  return WIRED_BY_TEMPLATE[templateId] ?? NOTE_COMPONENT_IDS
}

/** 宿主存不住这个组件 —— 添加列表里不出现，设置里也不该假装能开 */
export function isComponentAvailable(templateId: string, componentId: TemplateComponentId): boolean {
  return availableComponents(templateId).includes(componentId)
}

/** 接线 = 宿主可用（表里没有「可选但没画」这一档） */
export function isComponentWired(templateId: string, componentId: TemplateComponentId): boolean {
  return isComponentAvailable(templateId, componentId)
}
