/**
 * 模板组件参数 —— **契约与校验的唯一源**（`docs/模板.md §4` / §8.4）。
 *
 * 只登记**渲染器真的会消费**的参数：模板里能配、界面上能改、写进文件后能生效，
 * 三件事必须同时成立。`npm run audit:templates` 用这里查「配了没反应」的漂移。
 *
 * 这份文件不 import React，脚本与渲染器都能直接读。
 */
import type { TemplateComponent, TemplateComponentId, TemplateDoc } from './types'

export interface TemplateParamOption {
  value: string | number | boolean
  label: string
}

export type TemplateParamValue = string | number | boolean | string[]

export interface TemplateParamDef {
  key: string
  label: string
  /** `choice` = 行内分段按钮；`fields` = 字符串数组（基本信息字段表，不进轻量参数行） */
  kind: 'choice' | 'fields'
  /** 没写 / 写坏时的默认值（渲染器必须按同一个默认值走） */
  fallback: TemplateParamValue
  /** `choice` 的可选值；`fields` 为空 */
  options: TemplateParamOption[]
}

/** 每个组件允许的参数。没登记的组件不给参数入口。 */
export const TEMPLATE_PARAM_SCHEMA: Partial<Record<TemplateComponentId, TemplateParamDef[]>> = {
  info: [
    {
      key: 'fields',
      label: '字段',
      kind: 'fields',
      fallback: [],
      options: [],
    },
  ],
  relations: [
    {
      key: 'presentation',
      label: '呈现',
      kind: 'choice',
      fallback: 'table',
      options: [
        { value: 'table', label: '表格' },
        { value: 'compact', label: '紧凑' },
      ],
    },
    {
      key: 'title',
      label: '标题',
      kind: 'choice',
      fallback: true,
      options: [
        { value: true, label: '显示' },
        { value: false, label: '隐藏' },
      ],
    },
  ],
  gallery: [
    {
      key: 'mode',
      label: '模式',
      kind: 'choice',
      fallback: 'grid',
      options: [
        { value: 'grid', label: '网格' },
        { value: 'slider', label: '滑动' },
      ],
    },
    {
      key: 'columns',
      label: '列',
      kind: 'choice',
      fallback: 4,
      options: [2, 3, 4, 5].map((value) => ({ value, label: String(value) })),
    },
    {
      key: 'title',
      label: '标题',
      kind: 'choice',
      fallback: true,
      options: [
        { value: true, label: '显示' },
        { value: false, label: '隐藏' },
      ],
    },
  ],
}

/**
 * 参数只对**真正消费它的模板**开放。
 * 关系呈现目前只有角色编辑器接了；事件 / 国家的关联本来就是 chips。
 * `info.fields` 由宠物 / 武器的字段表消费（`lib/templates/fields.ts`）。
 */
export const TEMPLATE_PARAM_SUPPORT: Partial<Record<TemplateComponentId, string[]>> = {
  info: ['pet', 'weapon'],
  relations: ['character'],
  gallery: ['character'],
}

export function templateAcceptsParam(templateId: string, componentId: TemplateComponentId): boolean {
  const defs = TEMPLATE_PARAM_SCHEMA[componentId]
  if (!defs || defs.length === 0) return false
  return TEMPLATE_PARAM_SUPPORT[componentId]?.includes(templateId) ?? false
}

/** 某个模板的某个组件能编的全部参数（含重参数；没有消费方时为空） */
export function templateParamsFor(
  templateId: string,
  componentId: TemplateComponentId,
): TemplateParamDef[] {
  if (!templateAcceptsParam(templateId, componentId)) return []
  return TEMPLATE_PARAM_SCHEMA[componentId] ?? []
}

/** 能在编排行里用分段按钮改的参数（字段表这类重参数不进轻量行） */
export function inlineParamDefs(componentId: TemplateComponentId): TemplateParamDef[] {
  return (TEMPLATE_PARAM_SCHEMA[componentId] ?? []).filter((def) => def.kind === 'choice')
}

/** 读参数：没写就按契约里的默认值，渲染器不要自己再写一遍字面量 */
export function componentParam(component: TemplateComponent | undefined, key: string, fallback: boolean): boolean
export function componentParam(component: TemplateComponent | undefined, key: string, fallback: number): number
export function componentParam(component: TemplateComponent | undefined, key: string, fallback: string): string
export function componentParam(component: TemplateComponent | undefined, key: string, fallback: string[]): string[]
export function componentParam(
  component: TemplateComponent | undefined,
  key: string,
  fallback: TemplateParamValue,
): TemplateParamValue {
  const value = component?.params?.[key]
  return value === undefined ? fallback : value
}

/** 校验一份模板：参数键必须在契约里、值必须是允许的选项。返回人可读的错误。 */
export function validateTemplateParams(doc: TemplateDoc): string[] {
  const errors: string[] = []
  for (const component of doc.components) {
    const defs = TEMPLATE_PARAM_SCHEMA[component.id]
    if (!component.params) continue
    for (const [key, value] of Object.entries(component.params)) {
      const def = defs?.find((item) => item.key === key)
      if (!def) {
        errors.push(`「${doc.name}」的「${component.id}」没有参数 ${key}`)
        continue
      }
      if (!templateAcceptsParam(doc.id, component.id)) {
        errors.push(`「${doc.name}」的「${component.id}」不该有参数（渲染器未消费）`)
        continue
      }
      if (def.kind === 'fields') {
        const valid =
          Array.isArray(value)
            ? value.every((item) => typeof item === 'string' && item.trim() !== '')
            : typeof value === 'string'
        if (!valid) {
          errors.push(`「${doc.name}」的「${component.id}.${key}」必须是字段名数组`)
        }
        continue
      }
      if (!def.options.some((option) => option.value === value)) {
        errors.push(`「${doc.name}」的「${component.id}.${key}」值不合法：${String(value)}`)
      }
    }
  }
  return errors
}
