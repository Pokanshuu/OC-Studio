/**
 * 灵感：随手记。
 *
 * 它**不是实体**，不进世界观目录树、不进相册、不进关系图 —— 灵感是还没成形的
 * 东西，一旦混进设定集，作者找东西时就会被半成品淹没。
 *
 * 存储放 `.ocstudio/inspirations.json`（跟库走、换机器一致），浏览器预览退
 * localStorage。为什么不落成 `.md` 笔记：灵感是**草稿**，不是设定；写成笔记就会
 * 被扫描进词条树，那正是上面要避免的。真用起来的东西再「升级成笔记」。
 */
export interface Inspiration {
  id: string
  title: string
  /** Tiptap 文档（JSON 字符串）或老数据里的 HTML 片段 */
  content: string
  createdAt: number
  updatedAt: number
  /**
   * 已经升级成的词条 id。
   *
   * 升级是**单向**的：灵感留着（草稿是过程），词条才是结果。记下 id 是为了
   * 界面上能说清「这条已经变成哪一篇了」，而不是让人猜自己按过没有。
   */
  promotedId?: number
}

export const INSPIRATIONS_REL_PATH = '.ocstudio/inspirations.json'
export const INSPIRATIONS_LS_KEY = 'oc-inspirations-v1'
export const INSPIRATIONS_VERSION = 1

/** 空条目的内容：与编辑器给的空文档一致，避免出现 `''` 与 `'<p></p>'` 两种空 */
export const EMPTY_INSPIRATION_CONTENT = '<p></p>'

export function newInspirationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `insp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 正文纯文本：列表摘要、搜索、字数都靠它。
 *
 * 同时吃 HTML 与 Tiptap JSON —— 老数据是 HTML 片段，新数据是 JSON 字符串。
 */
export function inspirationText(content: string): string {
  if (content.trim() === '') return ''
  let source = content
  if (source.trimStart().startsWith('{')) {
    try {
      const parts: string[] = []
      const walk = (node: unknown): void => {
        if (node === null || typeof node !== 'object') return
        const record = node as Record<string, unknown>
        if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
        if (Array.isArray(record.content)) for (const child of record.content) walk(child)
      }
      walk(JSON.parse(source))
      source = parts.join(' ')
    } catch {
      // 坏 JSON 就当纯文本处理，下面统一剥标签
    }
  }
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  }
  return source
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

/** 列表上显示的名字：标题空就退回正文第一句 */
export function inspirationLabel(item: Inspiration): string {
  const title = item.title.trim()
  if (title !== '') return title
  const text = inspirationText(item.content)
  return text === '' ? '未命名灵感' : text.slice(0, 30)
}

/**
 * 归一化：坏行只丢那一行，不连坐整份文件。
 * 顺序按 `updatedAt` 倒序 —— 最近想到的排最上面。
 */
export function normalizeInspirations(raw: unknown): Inspiration[] {
  const list = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : []
  const out: Inspiration[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' && record.id.trim() !== '' ? record.id.trim() : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now()
    const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt
    out.push({
      id,
      title: typeof record.title === 'string' ? record.title : '',
      content: typeof record.content === 'string' ? record.content : EMPTY_INSPIRATION_CONTENT,
      createdAt,
      updatedAt,
      ...(typeof record.promotedId === 'number' && Number.isFinite(record.promotedId)
        ? { promotedId: record.promotedId }
        : {}),
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function serializeInspirations(items: Inspiration[]): string {
  return `${JSON.stringify({ version: INSPIRATIONS_VERSION, items }, null, 2)}\n`
}

export function parseInspirations(raw: string | null): Inspiration[] {
  if (raw === null || raw.trim() === '') return []
  try {
    return normalizeInspirations(JSON.parse(raw))
  } catch {
    return []
  }
}
