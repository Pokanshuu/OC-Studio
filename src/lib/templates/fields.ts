/**
 * 模板声明的「基本信息字段」—— 宠物 / 武器的专题字段从这里来。
 *
 * 参数形态两种都认：
 * - `fields: [物种, 习性]`（内置模板与界面写入的形态）
 * - `fields: 物种,习性`（手写模板的偷懒形态）
 *
 * 返回 `undefined` = 没声明（编辑器回落到字段表里的全部自定义字段）；
 * 返回空数组 = 明确声明「这个模板不要自定义字段」。
 */
import type { TemplateDoc } from './types'
import { isNoteTemplate } from './note'

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

export function templateFieldKeys(doc: TemplateDoc): string[] | undefined {
  const info = doc.components.find((component) => component.id === 'info')
  return normalizeKeys(info?.params?.fields)
}

/** 全部模板用到的字段键（给 frontmatter 词汇表登记用） */
export function collectTemplateFieldKeys(docs: TemplateDoc[]): string[] {
  const out = new Set<string>()
  for (const doc of docs) {
    if (!isNoteTemplate(doc)) continue
    for (const key of templateFieldKeys(doc) ?? []) out.add(key)
  }
  return [...out]
}
