/**
 * 文档导出的**唯一模型**。
 *
 * 三个出口（Word `.docx` / Markdown / TXT）和预览共用这一份 `DocumentModel`：
 * 预览负责把它画成一页纸，导出负责把它序列化成各自的格式。以前 Markdown 预览
 * 直接糊一坨源码，是因为没有模型 —— 生成函数既是「数据」又是「排版」。
 *
 * 正文一律走 `lib/export/site/render`：词条正文可能是 Tiptap JSON、早期 HTML
 * 片段、或纯文本，那套渲染已经处理了三种形态（静态站一直在用），这里不再写第二份。
 */
import { db } from '@/lib/db'
import type { PageDoc } from './page'
import { hasRichText, plainTextOf, renderRichText } from './site/render'
import { isCodexEntry } from '@/lib/entry-kinds'

export type DocumentSection = 'characters' | 'events' | 'countries' | 'world'

export const DOCUMENT_SECTIONS: Array<{ key: DocumentSection; label: string }> = [
  { key: 'characters', label: '角色' },
  { key: 'events', label: '事件' },
  { key: 'countries', label: '国家' },
  { key: 'world', label: '词条' },
]

export const DOCUMENT_SECTION_LABELS: Record<DocumentSection, string> = {
  characters: '角色',
  events: '事件',
  countries: '国家',
  world: '词条',
}

export interface DocumentField {
  label: string
  value: string
}

export interface DocumentEntry {
  /** 稳定 key（`角色:12`），预览与列表都用它 */
  id: string
  title: string
  fields: DocumentField[]
  /** 正文 HTML（预览；与静态站同一套渲染） */
  html: string
  /** 正文纯文本（Markdown / DOCX 用） */
  text: string
}

export interface DocumentSectionModel {
  key: DocumentSection
  label: string
  entries: DocumentEntry[]
}

export interface DocumentModel {
  /** 文档标题（项目名，缺省 OC Studio） */
  title: string
  /** 副标题（导出口径 + 日期） */
  subtitle: string
  sections: DocumentSectionModel[]
  /** 实际导出的条目总数 */
  total: number
}

export interface DocumentBuildOptions {
  /** 只导出勾选的分区；缺省全开 */
  sections?: Partial<Record<DocumentSection, boolean>>
}

function on(options: DocumentBuildOptions, section: DocumentSection): boolean {
  return options.sections?.[section] !== false
}

/** 导出日期按本地日历（东八区凌晨 `toISOString()` 会少一天） */
export function documentDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function clean(value: string | undefined | null): string {
  return (value ?? '').trim()
}

function field(label: string, value: string | undefined | null): DocumentField | null {
  // 老库的 `制度` / `职业` / `时间` 这些字段存的是富文本 HTML，文档里不能把 `<p>` 印上去
  const text = plainTextOf(value ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? null : { label, value: text }
}

function compact(fields: Array<DocumentField | null>): DocumentField[] {
  return fields.filter((item): item is DocumentField => item !== null)
}

/** 正文：优先富文本字段，没有才落到早期的纯文本 / HTML 字段。 */
function bodyOf(primary: unknown, fallback: string): { html: string; text: string } {
  const source = hasRichText(primary) ? primary : fallback
  return {
    html: renderRichText(source),
    text: plainTextOf(source).replace(/\n{3,}/g, '\n\n').trim(),
  }
}

export async function buildDocumentModel(options: DocumentBuildOptions = {}): Promise<DocumentModel> {
  const [characters, events, countries, worldEntries, meta] = await Promise.all([
    db.characters.filter((row) => !row.deleted).toArray(),
    db.events.filter((row) => !row.deleted).toArray(),
    db.countries.filter((row) => !row.deleted).toArray(),
    // 小说章节与地图也是 `worldEntries`，但它们不是「词条」：
    // 前者属于小说导出，后者是纯底图（正文几乎是空的）。
    // 以前不过滤，导出的设定集里会混进「第一章」「世界地图」这类空白条目。
    db.worldEntries.filter((row) => !row.deleted && isCodexEntry(row)).toArray(),
    db.meta.get(1).catch(() => undefined),
  ])

  const sections: DocumentSectionModel[] = []

  if (on(options, 'characters')) {
    sections.push({
      key: 'characters',
      label: '角色',
      entries: characters.map((row) => {
        const body = bodyOf(row.document, [row.bio, row.lifeStory].filter((part) => clean(part) !== '').join('\n\n'))
        return {
          id: `角色:${row.id}`,
          title: clean(row.name) === '' ? '未命名角色' : row.name.trim(),
          fields: compact([
            field('别名', row.aliases.filter((alias) => alias.trim() !== '').join('、')),
            field('种族', row.race),
            field('元素', row.element),
            field('职业', row.occupation),
            field('国籍', row.nationalityLegacy),
            field('身高', row.height),
            field('生日', row.birthday),
          ]),
          html: body.html,
          text: body.text,
        }
      }),
    })
  }

  if (on(options, 'events')) {
    sections.push({
      key: 'events',
      label: '事件',
      entries: events.map((row) => {
        const body = bodyOf(row.document, [row.summary, row.content].filter((part) => clean(part) !== '').join('\n\n'))
        const range = clean(row.time) + (clean(row.endTime) === '' ? '' : ` ~ ${clean(row.endTime)}`)
        return {
          id: `事件:${row.id}`,
          title: clean(row.title) === '' ? '未命名事件' : row.title.trim(),
          fields: compact([
            field('时间', range),
            field('地点', row.location),
            row.isMajor ? { label: '标记', value: '重大事件' } : null,
          ]),
          html: body.html,
          text: body.text,
        }
      }),
    })
  }

  if (on(options, 'countries')) {
    sections.push({
      key: 'countries',
      label: '国家',
      entries: countries.map((row) => {
        // 有富文本正文时，体制 / 地理 / 文化是正文的一部分；否则它们退回字段，
        // 免得四个长段落挤成一段、读起来没有边界。
        const rich = hasRichText(row.document)
        const legacy = [row.description, row.system, row.geography, row.culture]
          .filter((part) => clean(part) !== '')
          .join('\n\n')
        const body = rich
          ? bodyOf(row.document, legacy)
          : bodyOf(undefined, clean(row.description))
        return {
          id: `国家:${row.id}`,
          title: clean(row.name) === '' ? '未命名国家' : row.name.trim(),
          fields: rich
            ? []
            : compact([field('体制', row.system), field('地理', row.geography), field('文化', row.culture)]),
          html: body.html,
          text: body.text,
        }
      }),
    })
  }

  if (on(options, 'world')) {
    sections.push({
      key: 'world',
      label: '词条',
      entries: worldEntries.map((row) => {
        const body = bodyOf(row.document, clean(row.content))
        return {
          id: `词条:${row.id}`,
          title: clean(row.title) === '' ? '未命名词条' : row.title.trim(),
          fields: [],
          html: body.html,
          text: body.text,
        }
      }),
    })
  }

  const kept = sections.filter((section) => section.entries.length > 0)
  const worldName = clean(meta?.worldName)

  return {
    title: worldName === '' ? 'OC Studio 设定集' : worldName,
    subtitle: `OC Studio 导出 · ${documentDate()}`,
    sections: kept,
    total: kept.reduce((sum, section) => sum + section.entries.length, 0),
  }
}

/** 每个分区的条目数（设置面板右上角的数字）。 */
/**
 * 按「分区开关 + 选中的条目」裁一遍模型。
 *
 * 为什么放在这里而不是面板里：这是**导出范围**的唯一口径，预览与三种格式都吃它的结果，
 * 而且它得能被自检直接断言（组件里的函数测不到）。
 *
 * `scope === 'picked'` 且 `picked` 为空时结果就是空的 —— 界面据此禁用导出并提示，
 * **不要**偷偷退回「全部」。
 */
export function selectDocumentEntries(
  model: DocumentModel,
  sections: Partial<Record<DocumentSection, boolean>>,
  scope: 'all' | 'picked' = 'all',
  picked: ReadonlySet<string> = new Set(),
): DocumentModel {
  const kept = model.sections
    .filter((section) => sections[section.key] !== false)
    .map((section) =>
      scope === 'all'
        ? section
        : { ...section, entries: section.entries.filter((entry) => picked.has(entry.id)) },
    )
  const total = kept.reduce((sum, section) => sum + section.entries.length, 0)
  return { ...model, sections: kept, total }
}

export function documentCounts(model: DocumentModel): Record<DocumentSection, number> {
  const counts: Record<DocumentSection, number> = { characters: 0, events: 0, countries: 0, world: 0 }
  for (const section of model.sections) counts[section.key] = section.entries.length
  return counts
}

/**
 * 文档模型 → 预览用的 `PageDoc`（`lib/export/page`）。
 *
 * 预览是**共用**的（小说导出也用 `PagePreview`），所以这里只做形状转换：
 * 分区 → 分区、条目 → 条目、字段与正文原样带过去。
 */
export function toPageDoc(model: DocumentModel): PageDoc {
  return {
    title: model.title,
    subtitle: model.subtitle,
    sections: model.sections.map((section) => ({
      id: section.key,
      label: section.label,
      entries: section.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        fields: entry.fields,
        html: entry.html,
        text: entry.text,
      })),
    })),
  }
}
