/**
 * 内置模板（出厂定义）。
 *
 * 顺序按 `docs/模板.md §4` 的规范清单来，**不是**照抄现在某个编辑器的 JSX 顺序：
 * 阶段一把编辑器迁到渲染循环时，用这份清单对齐；迁移完再让用户改。
 *
 * 恢复默认 = 把对应一条换回这里的定义（其余不动）。
 */
import type { BuiltinTemplateId, TemplateComponent, TemplateDoc } from './types'

function components(
  ids: TemplateComponent['id'][],
  params: Partial<Record<TemplateComponent['id'], TemplateComponent['params']>> = {},
): TemplateComponent[] {
  return ids.map((id) => ({ id, enabled: true, ...(params[id] === undefined ? {} : { params: params[id] }) }))
}

export const BUILTIN_TEMPLATES: TemplateDoc[] = [
  {
    id: 'character',
    name: '角色',
    aliases: ['人物'],
    components: components(['cover', 'info', 'relations', 'tags', 'gallery', 'summary', 'body']),
  },
  {
    id: 'event',
    name: '事件',
    aliases: [],
    components: components(['cover', 'info', 'time', 'place', 'relations', 'tags', 'gallery', 'summary', 'body']),
  },
  {
    id: 'country',
    name: '国家',
    aliases: ['势力'],
    components: components(['cover', 'info', 'relations', 'tags', 'gallery', 'summary', 'body']),
  },
  {
    id: 'entry',
    name: '词条',
    aliases: [],
    components: components(['info', 'tags', 'body']),
  },
  {
    // 宠物 / 武器：**内置模板，但不预建分类**（分类在 settings 里按需启用，见 categories/builtins）。
    // 只接线词条真正有的四块 —— 不写封面 / 画廊这类还没有数据列的组件。
    // `fields` 是模板自己的「基本信息」字段：键 = frontmatter 同名键，值落 WorldEntry.custom。
    // 字段清单对齐改版（`entity-info.ts` 的 pet / weapon 两组），删掉了那边给旧 `Character`
    // 列做映射的 `legacy` 项 —— 我们这边一律走 custom，没有列要回落。
    id: 'pet',
    name: '宠物',
    aliases: ['伙伴'],
    components: components(['cover', 'info', 'tags', 'summary', 'body'], {
      info: {
        fields: [
          '物种',
          '品种',
          '性别',
          '年龄',
          '体型',
          '体重',
          '外观特征',
          '性格',
          '习性',
          '饮食偏好',
          '能力技能',
          '出生日期',
          '收养日期',
          '栖息地',
          '当前状态',
        ],
      },
    }),
  },
  {
    id: 'weapon',
    name: '武器',
    aliases: ['装备'],
    components: components(['cover', 'info', 'tags', 'summary', 'body'], {
      info: {
        fields: [
          '武器类型',
          '材质',
          '稀有度',
          '尺寸',
          '重量',
          '制造者',
          '铸造时间',
          '来源',
          '使用条件',
          '能力效果',
          '属性元素',
          '当前状态',
        ],
      },
    }),
  },
]

export function builtinTemplate(id: BuiltinTemplateId): TemplateDoc {
  const found = BUILTIN_TEMPLATES.find((doc) => doc.id === id)
  if (!found) throw new Error(`未登记的内置模板：${id}`)
  // 深拷贝：调用方会就地改 components
  return JSON.parse(JSON.stringify(found)) as TemplateDoc
}
