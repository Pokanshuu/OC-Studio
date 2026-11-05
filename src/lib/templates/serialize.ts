/**
 * 模板文件 ⇄ `TemplateDoc`。
 *
 * 文件形态（`docs/模板.md §3.2`）：
 * ```md
 * ---
 * id: character
 * 名称: 角色
 * 别名: [人物]
 * 组件:
 *   - id: cover
 *     开: true
 *   - id: info
 *     开: true
 * 主题: paper
 * ---
 * ```
 * 正文是给人看的说明，读的时候忽略；**机器只认 frontmatter**。
 *
 * 兼容：`组件:` 允许写成字符串数组（`[cover, info]`，等价于全部启用），
 * 老模板 / 手写模板不必先补 `开:`。
 */
import { dump, load } from 'js-yaml'
import { COMPONENT_BY_ID, COMPONENT_IDS } from './registry'
import type { TemplateComponent, TemplateComponentId, TemplateDoc } from './types'

export function isTemplateComponentId(value: unknown): value is TemplateComponentId {
  return typeof value === 'string' && value in COMPONENT_BY_ID
}

function normalizeComponents(raw: unknown): TemplateComponent[] {
  if (!Array.isArray(raw)) return []
  const out: TemplateComponent[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string') {
      if (!isTemplateComponentId(item) || seen.has(item)) continue
      seen.add(item)
      out.push({ id: item, enabled: true })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = record.id
    if (!isTemplateComponentId(id) || seen.has(id)) continue
    seen.add(id)
    const enabled = record['开'] ?? record.enabled
    const params = record['参数'] ?? record.params
    out.push({
      id,
      enabled: enabled === undefined ? true : Boolean(enabled),
      params: params && typeof params === 'object' ? (params as TemplateComponent['params']) : undefined,
    })
  }
  return out
}

export function serializeTemplate(doc: TemplateDoc): string {
  const frontmatter: Record<string, unknown> = {
    id: doc.id,
    名称: doc.name,
  }
  if (doc.aliases.length > 0) frontmatter['别名'] = doc.aliases
  frontmatter['组件'] = doc.components.map((component) => {
    const entry: Record<string, unknown> = { id: component.id, 开: component.enabled }
    if (component.params && Object.keys(component.params).length > 0) entry['参数'] = component.params
    return entry
  })
  if (doc.theme) frontmatter['主题'] = doc.theme

  const yamlText = dump(frontmatter, { lineWidth: -1, noRefs: true, forceQuotes: false })
  return `---\n${yamlText}---\n\n# ${doc.name}\n\n（这一栏只是给人看的说明；读写以 frontmatter 为准。）\n`
}

export function parseTemplate(raw: string, fallbackId: string): TemplateDoc | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!match) return null

  let data: unknown
  try {
    data = load(match[1])
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : fallbackId
  const name = typeof record['名称'] === 'string' ? record['名称'].trim() : ''
  if (!name) return null

  const aliasesRaw = record['别名']
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw.filter((alias): alias is string => typeof alias === 'string' && alias.trim() !== '')
    : []

  const components = normalizeComponents(record['组件'] ?? record.components)
  const theme = typeof record['主题'] === 'string' ? record['主题'] : undefined

  return { id, name, aliases, components, theme }
}

/** 模板里有没有「认不出的组件 id」—— 编排界面要提示，校验脚本要报 */
export function unknownComponentIds(doc: TemplateDoc): string[] {
  return doc.components.map((component) => component.id).filter((id) => !COMPONENT_IDS.includes(id))
}
