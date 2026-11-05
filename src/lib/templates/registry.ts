/**
 * 组件登记表 —— 模板能配的「闭集」。
 *
 * 这里只有**元数据**（id / 名称 / 级别 / 可配参数），不 import React：
 * 设置界面、脚本校验、渲染器三方共用同一份清单。
 *
 * 渲染器在 `src/components/shared/template-registry.tsx`，键必须与这里对齐，
 * `npm run audit:templates` 会做双向检查（登记了没渲染器 / 有渲染器没登记）。
 */
import type { TemplateComponentId } from './types'

export type ComponentLevel = 'block' | 'atom'

export interface ComponentMeta {
  id: TemplateComponentId
  /** 界面上的中文名（模板文件里仍存 id） */
  label: string
  level: ComponentLevel
  /** 该组件允许的参数键（编排抽屉只渲染这些） */
  params?: string[]
  /** 特殊约定 */
  note?: string
}

export const TEMPLATE_COMPONENTS: ComponentMeta[] = [
  { id: 'cover', label: '封面', level: 'block', note: '永远贴顶、无标题行' },
  { id: 'avatar', label: '头像', level: 'block', note: '只画头像；封面组件里已经含头像，单独摆时才开' },
  { id: 'info', label: '基本信息', level: 'block', params: [], note: '组内 atom 另行编排' },
  { id: 'relations', label: '关系', level: 'block', params: ['presentation', 'title'], note: '角色 / 事件 / 国家同一实现；三档呈现写回模板' },
  { id: 'tags', label: '标签', level: 'block' },
  { id: 'image', label: '图片', level: 'block', params: ['width', 'title'], note: '单张；与画廊是同一个图片能力的两个槽位' },
  { id: 'gallery', label: '画廊', level: 'block', params: ['mode', 'columns'] },
  { id: 'time', label: '时间', level: 'block', params: ['title'] },
  { id: 'place', label: '地点', level: 'block' },
  { id: 'summary', label: '简介', level: 'block' },
  { id: 'body', label: '正文', level: 'block', note: '无标题行，位置可排' },
]

export const COMPONENT_BY_ID: Record<TemplateComponentId, ComponentMeta> = Object.fromEntries(
  TEMPLATE_COMPONENTS.map((meta) => [meta.id, meta]),
) as Record<TemplateComponentId, ComponentMeta>

export const COMPONENT_IDS: TemplateComponentId[] = TEMPLATE_COMPONENTS.map((meta) => meta.id)
