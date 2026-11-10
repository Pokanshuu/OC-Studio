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
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { ComponentEditProvider } from './ComponentEdit'
import { COMPONENT_BY_ID } from '@/lib/templates/registry'
import { componentEditTarget } from '@/lib/templates/edit-target'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'

interface TemplateRendererProps {
  template: TemplateDoc
  /** 组件 → 节点；返回 `null` 表示这个区块这次不出现 */
  render: (component: TemplateComponent) => ReactNode
  className?: string
}

export function TemplateRenderer({ template, render, className = 'flex flex-col gap-8' }: TemplateRendererProps) {
  const { openSettings } = useSettingsTrigger()
  const visible = template.components.filter((component) => component.enabled)

  const blocks: { id: string; node: ReactNode }[] = []
  for (const component of visible) {
    const node = render(component)
    if (node === null || node === undefined || node === false) continue
    blocks.push({ id: component.id, node })
  }

  const content = (
    <div className={className}>
      {blocks.map((block, index) => {
        // 封面与下方内容之间不画线（`docs/模板.md §6.1`）；第一个区块也不画。
        // 头像同理：它要么叠在封面上，要么自己就是最上面那张脸 —— 名字上方再来一条线
        // 等于把「脸」和「这个人叫什么」切成两段（2026-11-10 去掉了）。
        const previous = blocks[index - 1]?.id
        const divider = index > 0 && previous !== 'cover' && previous !== 'avatar'
        /**
         * 紧跟头像的那一块往上收 24px。
         *
         * 头像靠 `-top-16` 往上叠进封面，视觉上它比自己的布局框高 64px，
         * 于是下面那块虽然只隔了 `gap-8`，看着却像空了小一百 —— 脸和名字之间
         * 不该有这么大一段白（2026-11-10 收紧）。
         * 只收 24：头像是个圆，圆底到方框底之间本来就是空的，收多了会**看着贴上去**。
         */
        const snuggleAfterAvatar = previous === 'avatar'
        /**
         * 头像紧跟封面时**叠在封面上**（用户拍板：这是完全可接受的版式）。
         *
         * 头像槽固定 64px（`Avatar` 的 `lg`）：相对上移 64，圆心正好落在封面上缘
         * （抵消 gap-8(32) + 再叠进封面 32）；底部再补 -mb-16 把后面的区块拉回来。
         * **不用负 top margin**：margin 会参与 flex 尺寸计算，后面的区块会被顶到脸上。
         * 容器缩进 16px，和以前头像在封面里的位置一致。
         */
        const overlapCover = block.id === 'avatar' && previous === 'cover'
        // 有组件库的两块（基本信息 / 正文）：悬停时右上角给一个「去编辑这个组件」
        // 正文没有标题行，设置键只能浮在块右上角；基本信息放在自己「基本信息」标题行上
        const edit = block.id === 'body' ? componentEditTarget(template.id, 'body') : null
        return (
          <ComponentSection
            key={block.id}
            // 标题由各渲染器自己画（它们知道自己的动作按钮），壳这里不重复
            divider={divider}
            className={
              overlapCover
                ? 'relative z-10 -top-16 -mb-16 ml-4'
                : snuggleAfterAvatar
                  ? '-mt-6'
                  : ''
            }
            componentId={block.id}
            componentLabel={COMPONENT_BY_ID[block.id as keyof typeof COMPONENT_BY_ID]?.label}
            onEdit={edit ? () => openSettings('world', 'components', edit.target) : undefined}
            editLabel={edit?.label}
          >
            {block.node}
          </ComponentSection>
        )
      })}
    </div>
  )

  return <ComponentEditProvider templateId={template.id}>{content}</ComponentEditProvider>
}
