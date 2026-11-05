/**
 * 阶段一「哪些组件真的接线了」——**唯一登记处**。
 *
 * 为什么要这张表：模板能配的组件是闭集，但渲染循环是一个实体一个实体接的。
 * 如果设置里让用户关掉一个「还没接线」的组件，它会毫无反应 —— 那正是
 * `docs/模板.md §14` 里点名的「配了没反应的组件」。所以这里登记真实进度：
 *
 * - 只有登记为 `true` 的组件才允许在设置里开关
 * - 其余显示「开发中」且不可点
 * - `npm run audit:templates` 会检查这里列出的 id 都真实存在于组件登记表
 *
 * **接完一个实体就更新这张表**，否则界面上的进度会撒谎。
 */
import type { TemplateComponentId } from './types'

export const WIRED_BY_TEMPLATE: Record<string, TemplateComponentId[]> = {
  // 词条：标题 / 标签（含被引用）/ 正文
  entry: ['info', 'tags', 'body'],
  // 事件：封面 / 标题 + 基本信息 / 关联
  event: ['cover', 'info', 'relations'],
  // 国家：旗帜 + 封面 / 名称 / 关联
  country: ['cover', 'info', 'relations'],
  // 角色：封面+头像 / 名称+字段+立绘 / 关系 / 相册
  character: ['cover', 'info', 'relations', 'gallery'],
  // 宠物 / 武器（自定义分类的内置模板）：封面 / 标题 / 标签 / 简介 / 正文
  pet: ['cover', 'info', 'tags', 'summary', 'body'],
  weapon: ['cover', 'info', 'tags', 'summary', 'body'],
}

export function isComponentWired(templateId: string, componentId: TemplateComponentId): boolean {
  return (WIRED_BY_TEMPLATE[templateId] ?? []).includes(componentId)
}
