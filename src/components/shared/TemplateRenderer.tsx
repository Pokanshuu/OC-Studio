'use client'

/**
 * 模板渲染循环 —— 把「模板 = 有序组件列表」变成实际的界面。
 *
 * 阶段一的原则（`docs/模板.md §11`）：**数据仍写原有强类型列，模板只决定怎么拼**。
 * 所以这里不碰任何字段，只按 `template.components` 的顺序与开关，调用调用方给的渲染器。
 *
 * 约定：
 * - `render` 返回 `null` = 这个组件在当前实体上没有可渲染的东西（例如没有画廊），
 *   那就不占位、也不画分隔线
 * - 第一个渲染出来的区块不画分隔线，之后每个区块顶部一条 1px 线（`ComponentSection`）
 * - 间距只由外层 `gap-8` 给，组件自己不许带 margin
 */
import type { ReactNode } from 'react'
import { ComponentSection } from './ComponentSection'
import { COMPONENT_BY_ID } from '@/lib/templates/registry'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'

interface TemplateRendererProps {
  template: TemplateDoc
  /** 组件 → 节点；返回 `null` 表示这个区块这次不出现 */
  render: (component: TemplateComponent) => ReactNode
  className?: string
}

export function TemplateRenderer({ template, render, className = 'flex flex-col gap-8' }: TemplateRendererProps) {
  const visible = template.components.filter((component) => component.enabled)

  const blocks: { id: string; node: ReactNode }[] = []
  for (const component of visible) {
    const node = render(component)
    if (node === null || node === undefined || node === false) continue
    blocks.push({ id: component.id, node })
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        // 封面与下方内容之间不画线（`docs/模板.md §6.1`）；第一个区块也不画
        const previous = blocks[index - 1]?.id
        const divider = index > 0 && previous !== 'cover'
        return (
          <ComponentSection
            key={block.id}
            // 标题由各渲染器自己画（它们知道自己的动作按钮），壳这里不重复
            divider={divider}
            componentId={block.id}
            componentLabel={COMPONENT_BY_ID[block.id as keyof typeof COMPONENT_BY_ID]?.label}
          >
            {block.node}
          </ComponentSection>
        )
      })}
    </div>
  )
}
