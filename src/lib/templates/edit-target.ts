/**
 * 「这一块由哪个组件渲染 → 点设置键该跳到设置里的哪一页」。
 *
 * 只有**有组件库**的两块能给这个入口：基本信息（`InfoGroup`）与正文（`BodyGroup`）。
 * 关系 / 画廊的参数是模板自己的（不是可复用组件），它们的入口仍在编排层，不在这儿。
 *
 * 返回值直接喂给 `openSettings('world', 'components', target)`：
 * - `group:<id>` → 基本信息组件（列型宿主会落到字段表编辑器）
 * - `body:<id>`  → 正文组件
 */
import { defaultBodyGroupIdOfTemplate } from './body-groups'
import { bodyGroupIdOfTemplate } from './body-preset'
import { infoGroupHostOfTemplate } from './info-groups'
import { getTemplates } from './store'

function groupParamOf(templateId: string): string {
  const doc = getTemplates().find((item) => item.id === templateId)
  const value = doc?.components.find((component) => component.id === 'info')?.params?.group
  return typeof value === 'string' ? value.trim() : ''
}

/** 模板当前选中的基本信息组件 id；没选 → 按宿主给内置那一份（认不出宿主就不给入口） */
export function infoGroupIdOfTemplate(templateId: string): string | null {
  const selected = groupParamOf(templateId)
  if (selected !== '') return selected
  const host = infoGroupHostOfTemplate(templateId)
  if (host === 'character') return 'group-character'
  if (host === 'event') return 'group-event'
  if (host === 'world') return 'group-world'
  // 国家没有字段表、笔记类模板的自建字段不在组件面板里：给不出能跳的目标就不给入口
  return null
}

export interface ComponentEditTarget {
  /** `openSettings` 的第三段 */
  target: string
  /** 按钮的说明（读屏 / tooltip） */
  label: string
}

export function componentEditTarget(templateId: string, componentId: string): ComponentEditTarget | null {
  if (componentId === 'info') {
    const id = infoGroupIdOfTemplate(templateId)
    return id === null ? null : { target: `group:${id}`, label: '编辑基本信息组件' }
  }
  if (componentId === 'body') {
    // 没选过也要给入口：默认那一份骨架就是新建条目时会铺的东西
    const id = bodyGroupIdOfTemplate(templateId) || defaultBodyGroupIdOfTemplate(templateId)
    return { target: `body:${id}`, label: '编辑正文组件' }
  }
  return null
}
