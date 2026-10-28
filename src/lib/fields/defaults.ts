import type { FieldConfig, FieldDef, FieldKind } from './types'

/**
 * 内置字段目录 —— 表单上「可以出现」的全部行（不在这里的东西没有行：正文、关系、图片）。
 *
 * 顺序即默认顺序；`id` 必须与实体列名一致（`Character.race` / `Event.time` / …），
 * 因为值永远从列里读、写回列里去。删掉某一行只是把 `id` 从配置里去掉，列还在。
 */
export const BUILTIN_FIELDS: Record<FieldKind, FieldDef[]> = {
  character: [
    { id: 'aliases', label: '别名', type: 'text' },
    { id: 'race', label: '种族', type: 'text' },
    { id: 'element', label: '元素', type: 'text' },
    { id: 'occupation', label: '职业', type: 'text' },
    { id: 'faction', label: '阵营', type: 'text' },
    { id: 'country', label: '国籍', type: 'country' },
    { id: 'height', label: '身高', type: 'text' },
    { id: 'birthday', label: '生日', type: 'text' },
    { id: 'isMajor', label: '主要角色', type: 'bool' },
    { id: 'tags', label: '标签', type: 'tags' },
  ],
  event: [
    { id: 'time', label: '开始', type: 'text' },
    { id: 'endTime', label: '结束', type: 'text' },
    { id: 'location', label: '地点', type: 'text' },
    { id: 'isMajor', label: '重大事件', type: 'bool' },
    { id: 'tags', label: '标签', type: 'tags' },
  ],
  worldEntry: [
    { id: 'tags', label: '标签', type: 'tags' },
  ],
}

/** 默认配置 = 全部内置字段、默认顺序 */
export function defaultFields(kind: FieldKind): FieldDef[] {
  return BUILTIN_FIELDS[kind].map((field) => ({ ...field }))
}

export function defaultFieldConfig(): FieldConfig {
  return {
    character: defaultFields('character'),
    event: defaultFields('event'),
    worldEntry: defaultFields('worldEntry'),
  }
}

/** 某类实体里还没出现在配置中的内置字段（设置页「+ 添加字段」用） */
export function missingBuiltinFields(kind: FieldKind, current: FieldDef[]): FieldDef[] {
  const present = new Set(current.map((field) => field.id))
  return BUILTIN_FIELDS[kind].filter((field) => !present.has(field.id)).map((field) => ({ ...field }))
}
