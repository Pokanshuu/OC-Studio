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
import {
  LEGACY_COMPONENT_IDS,
  TEMPLATE_SCHEMA_VERSION,
  type TemplateComponent,
  type TemplateComponentId,
  type TemplateDoc,
} from './types'

export function isTemplateComponentId(value: unknown): value is TemplateComponentId {
  return typeof value === 'string' && value in COMPONENT_BY_ID
}

/**
 * 解析时放行已退役的 id：不这样的话旧文件里的「时间 / 地点」在解析阶段就被丢掉，
 * 升级逻辑看不到它们，词条里那两块也就没有机会补成基本信息的字段行。
 */
function isParsedComponentId(value: unknown): value is TemplateComponentId {
  return isTemplateComponentId(value) || (typeof value === 'string' && LEGACY_COMPONENT_IDS.includes(value))
}

function normalizeComponents(raw: unknown): TemplateComponent[] {
  if (!Array.isArray(raw)) return []
  const out: TemplateComponent[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string') {
      if (!isParsedComponentId(item) || seen.has(item)) continue
      seen.add(item)
      out.push({ id: item, enabled: true })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = record.id
    if (!isParsedComponentId(id) || seen.has(id)) continue
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
    版本: TEMPLATE_SCHEMA_VERSION,
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

/**
 * 一份「记录」→ `TemplateDoc`（**唯一的归一化入口**）。
 *
 * 三条读入路径共用它：模板文件的 frontmatter、localStorage 里的旧快照（浏览器预览）、
 * 以及以后可能的导入。三条路径各写一份字段兜底是上一版的真实教训 —— localStorage
 * 那份只查了 `id / name / components` 存在，缺 `aliases` 的条目进了缓存以后，
 * `findTemplateByName` 会在 `doc.aliases.includes` 上抛 TypeError，
 * 于是「新建任何条目」整个失败（桌面版读的是文件、走 parseTemplate，所以没暴露）。
 *
 * 中文键（文件格式）与英文键（JSON 快照）都认；认不出来的字段一律给安全默认值。
 */
export function docFromRecord(record: Record<string, unknown>, fallbackId: string): TemplateDoc | null {
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : fallbackId
  if (id === '') return null
  const rawName = record['名称'] ?? record.name
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name) return null

  const aliasesRaw = record['别名'] ?? record.aliases
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw
        .filter((alias): alias is string => typeof alias === 'string' && alias.trim() !== '')
        .map((alias) => alias.trim())
    : []

  const components = normalizeComponents(record['组件'] ?? record.components)
  const rawTheme = record['主题'] ?? record.theme
  const theme = typeof rawTheme === 'string' && rawTheme.trim() !== '' ? rawTheme.trim() : undefined
  const rawVersion = record['版本'] ?? record.version
  const schema = typeof rawVersion === 'number' && Number.isFinite(rawVersion) ? rawVersion : undefined

  return { id, name, aliases, components, theme, ...(schema !== undefined ? { schema } : {}) }
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
  return docFromRecord(data as Record<string, unknown>, fallbackId)
}

/** 模板里有没有「认不出的组件 id」—— 编排界面要提示，校验脚本要报 */
export function unknownComponentIds(doc: TemplateDoc): string[] {
  return doc.components.map((component) => component.id).filter((id) => !COMPONENT_IDS.includes(id))
}
