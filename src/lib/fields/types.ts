/**
 * 字段表 —— 决定「表单上有哪些行、什么顺序、叫什么名字」。
 *
 * 三层概念，别混：
 * - **内置字段**：实体本来就有对应的列（`race` / `faction` / …）。字段表只决定它显不显示、排第几、叫什么，
 *   值永远走原来的列 —— 因此隐藏 / 改显示名都**不动数据**，改回来就全在。
 * - **自定义字段**：字段表里新增的行，值存实体的 `custom` 对象（仓库模式写 frontmatter，键 = `key`）。
 * - **正文/关系/图片**（bio、document、relatedCharacters、gallery…）不在字段表里，永远在表单上。
 *
 * 存哪：有文件夹时读写 `.ocstudio/fields.json`（跟文件夹走，永久生效）；没有文件夹（浏览器预览）存 `meta` 表那条单例。
 * 范围：当前库 × 该类实体的**全部条目**（不是只对新条目生效）。
 */

/**
 * 目前开放字段表的实体类型。
 *
 * **国家不在里面**：国家的「体制 / 地理 / 文化」已经并进正文（`mergeCountrySections`），
 * 没有独立的字段行可增删；等国家真的有字段行再加进来，别在配置里放一堆渲染不出来的条目。
 */
export const FIELD_KINDS = ['character', 'event', 'worldEntry'] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/**
 * 控件类型。`text` 覆盖绝大多数；其余是内置字段专用的特化控件。
 * 自定义字段 v1 只有 `text`（文本框），够用且不需要额外存储结构。
 */
export type FieldType = 'text' | 'bool' | 'tags' | 'country' | 'countryParent'

export interface FieldDef {
  /** 稳定标识：内置字段用列名（race / faction / …），自定义字段用 `f_` 前缀 */
  id: string
  /** 显示名（可改；改它不影响数据） */
  label: string
  type: FieldType
  /** 自定义字段写进 frontmatter / custom 的键；内置字段留空（走实体列） */
  key?: string
}

export type FieldConfig = Record<FieldKind, FieldDef[]>

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  character: '角色基本信息',
  event: '事件信息',
  worldEntry: '词条信息',
}

/**
 * 能不能自建字段（往字段表里加一行没有对应列的新字段）。
 * 词条暂时不行：词条的编辑是「标题 + 正文 + 分类/标签」的内联形态，没有表单钩子可挂自定义值。
 * 内置字段的显示/改名/排序对三种实体都生效。
 */
export const FIELD_KIND_SUPPORTS_CUSTOM: Record<FieldKind, boolean> = {
  character: true,
  event: true,
  worldEntry: false,
}

/** 自定义字段的 id 前缀 —— 用它区分「内置」与「自建」 */
export const CUSTOM_FIELD_PREFIX = 'f_'

export function isCustomField(field: FieldDef): boolean {
  return field.id.startsWith(CUSTOM_FIELD_PREFIX)
}
