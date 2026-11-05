/**
 * 模板的「基本信息」字段 —— 从**选中的基本信息组件**取，不再内嵌在模板里。
 *
 * 模板只存 `info.params.group = <InfoGroup id>`；组件的字段 / 名字独立维护。
 * 兼容老数据：没有 `group` 但还有 `info.params.fields` 的模板按内联字段读。
 *
 * 两种字段写法都认（老数据）：
 * - `fields: [物种, 习性]`
 * - `fields: 物种,习性`
 */
import type { TemplateDoc } from './types'
import { isNoteTemplate } from './note'
import { getInfoGroups, type InfoGroup } from './info-groups'

const SPLIT = /[,，、]/

function normalizeKeys(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const keys = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item !== '')
    return keys.length === 0 ? [] : [...new Set(keys)]
  }
  if (typeof raw === 'string') {
    const keys = raw
      .split(SPLIT)
      .map((item) => item.trim())
      .filter((item) => item !== '')
    return keys.length === 0 ? [] : [...new Set(keys)]
  }
  return undefined
}

/**
 * 模板基本信息用到的字段键。
 * - 有 `group`：读组件；组件被删 / 找不到 → `[]`（不猜）
 * - 没有 `group`：读老的内联 `fields`
 * - 都没有：`undefined` = 回落到字段表里的全部自定义字段
 */
export function templateFieldKeys(doc: TemplateDoc, groups?: readonly InfoGroup[]): string[] | undefined {
  const info = doc.components.find((component) => component.id === 'info')
  const groupId = info?.params?.group
  if (typeof groupId === 'string' && groupId !== '') {
    const group = (groups ?? getInfoGroups()).find((item) => item.id === groupId)
    if (group) {
      /**
       * 只有 `note` 宿主的组件字段是**自建键**（落 `WorldEntry.custom`）。
       *
       * 角色 / 事件 / 词条的组件字段是**实体列 id**（`race` / `birthday`），
       * 它们由 `lib/fields/defaults.ts` 的 `FieldConfig` 管，不能混进自定义键
       * 词表 —— 混进去会被当成“声明了但永远不出现的自建字段”，
       * 还会让落盘侧的键集合凭空变大。
       */
      if (group.for !== undefined && group.for !== 'note') return undefined
      return [...group.fields]
    }
  }
  return normalizeKeys(info?.params?.fields)
}

/** 全部模板用到的字段键（给 frontmatter 词汇表登记用） */
export function collectTemplateFieldKeys(docs: TemplateDoc[], groups?: readonly InfoGroup[]): string[] {
  const out = new Set<string>()
  for (const doc of docs) {
    if (!isNoteTemplate(doc)) continue
    for (const key of templateFieldKeys(doc, groups) ?? []) out.add(key)
  }
  return [...out]
}
