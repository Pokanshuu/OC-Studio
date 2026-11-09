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
  /** 默认关闭的组件：仍留在列表里，用户想开就开 */
  off: TemplateComponent['id'][] = [],
): TemplateComponent[] {
  return ids.map((id) => ({
    id,
    enabled: !off.includes(id),
    ...(params[id] === undefined ? {} : { params: params[id] }),
  }))
}

export const BUILTIN_TEMPLATES: TemplateDoc[] = [
  {
    id: 'character',
    name: '角色',
    aliases: ['人物'],
    // 头像是独立组件（2026-11-09）：封面只画横幅，头像在自己的 1:1 槽里；
    // 立绘 / 动画也是组件（2026-11-09），不再硬编码在「基本信息」里
    components: components([
      'cover',
      'avatar',
      'info',
      'portrait',
      'relations',
      'tags',
      'gallery',
      'summary',
      'animation',
      'body',
    ]),
  },
  {
    id: 'event',
    name: '事件',
    aliases: [],
    // 时间 / 结束时间 / 地点是「基本信息」里的字段行（2026-11-10），不再是独立组件；
    // 简介紧跟基本信息：它是「一句话概括」，不是文末的附录
    components: components(['cover', 'info', 'summary', 'relations', 'tags', 'gallery', 'body']),
  },
  {
    id: 'country',
    name: '国家',
    aliases: ['势力'],
    // 旗帜 = 国家的 avatar 组件（独立一块，封面只画横幅）
    components: components(['cover', 'avatar', 'info', 'relations', 'tags', 'gallery', 'summary', 'body']),
  },
  {
    // 词条**没有全局字段**：默认只给「标签 + 正文」。
    // 想要结构化字段，就按篇换一个有「基本信息」的模板（宠物 / 武器 / 自建），
    // 或在模板里给词条加上基本信息组件 —— 字段由那份组件决定。
    id: 'entry',
    name: '词条',
    aliases: [],
    components: components(['tags', 'body']),
  },
  {
    // 宠物 / 武器：**内置模板，但不预建分类**（分类在 settings 里按需启用，见 categories/builtins）。
    // 基本信息**不内嵌字段**，只选择内置的基本信息组件（`group-pet` / `group-weapon`）——
    // 组件独立存在，可以被别的模板复用，名字也不跟模板绑定。
    id: 'pet',
    name: '宠物',
    aliases: ['伙伴'],
    components: components(['cover', 'info', 'tags', 'summary', 'body'], {
      info: { group: 'group-pet' },
    }),
  },
  {
    id: 'weapon',
    name: '武器',
    aliases: ['装备'],
    components: components(['cover', 'info', 'tags', 'summary', 'body'], {
      info: { group: 'group-weapon' },
    }),
  },
]

export function builtinTemplate(id: BuiltinTemplateId): TemplateDoc {
  const found = BUILTIN_TEMPLATES.find((doc) => doc.id === id)
  if (!found) throw new Error(`未登记的内置模板：${id}`)
  // 深拷贝：调用方会就地改 components
  return JSON.parse(JSON.stringify(found)) as TemplateDoc
}

/** 自建模板 id：稳定、可读、不会与内置冲突 */
export function customTemplateId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/**
 * 空白模板 = 封面 + 基本信息 + 正文（`docs/模板.md §8.7`）。
 *
 * `taken` 是现有模板名：重名就往后加序号 —— 两处「新建模板」（设置 › 模板、
 * 设置 › 组件 › 正文）共用这一份，别各自拼一个「新模板」出来。
 */
export function blankTemplateDoc(taken: Iterable<string> = []): TemplateDoc {
  const used = new Set(taken)
  let name = '新模板'
  for (let index = 2; used.has(name); index += 1) name = `新模板 ${index}`
  const components: TemplateComponent[] = (['cover', 'info', 'body'] as const).map((id) => ({
    id,
    enabled: true,
  }))
  return { id: customTemplateId(), name, aliases: [], components }
}
