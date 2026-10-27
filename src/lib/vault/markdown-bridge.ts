import { markdownToTiptap, tiptapToMarkdown, type LinkRef, type ResolvedLink, type TiptapNode } from './markdown'
import { normalizeLinkKey } from './wikilink'
import type { VaultEntityKind, VaultIndex, VaultScanResult, VaultStorableKind } from './types'

// ── 正文桥：把「扫描出的实体」与「Markdown 正文」接起来 ─────────────────
// 解析层只负责结构（字段/链接索引），Markdown 层只负责文本；
// 这个模块是两者的粘合剂，也是唯一知道「哪种实体的正文存在哪个字段」的地方。

/** 链接目标 → 编辑器节点。实体类型标识必须与 reference-registry 一致 */
export function createLinkResolver(
  index: VaultIndex,
): (ref: LinkRef) => ResolvedLink | null {
  return (ref) => {
    // `[[#标题]]`：指向**本文档内**的小节，没有目标实体（Obsidian 的就地锚点链接）。
    // 仍然要建一个节点：若返回 null，序列化时方括号会被转义成 `\[\[#标题\]\]`，
    // 那就是实打实地改了用户的文件。空 id 在编辑器里点不动，但原文能逐字还原。
    if (ref.target === '') {
      return {
        type: 'wikiLink',
        attrs: { id: '', label: ref.alias ?? ref.raw, raw: ref.raw },
      }
    }

    const candidates = index.byKey.get(normalizeLinkKey(ref.target))
    if (candidates === undefined || candidates.length === 0) return null

    // 标签不参与正文跳转（编辑器里没有标签的跳转目标）
    const target = candidates.find((item) => item.kind !== 'tag')
    if (target === undefined) return null

    const label = ref.alias ?? ref.target

    switch (target.kind) {
      case 'character':
      case 'event':
      case 'country':
        return {
          type: 'mention',
          attrs: { id: String(target.id), label, entityType: target.kind, raw: ref.raw },
        }
      case 'worldEntry':
        // 词条走 wikiLink：与编辑器的 [[ 补全行为一致（它只提供词条）
        return { type: 'wikiLink', attrs: { id: String(target.id), label, raw: ref.raw } }
      default:
        return null
    }
  }
}

/**
 * 把每篇笔记的正文 Markdown 转成编辑器文档。
 * 只对「有正文的实体类型」做，标签与时期没有正文。
 *
 * **解析失败的处理是刻意保守的**：不写入任何文档字段。
 * 这样 `documentOfEntity` 返回 null → `serializeBody` 返回 null → 该篇正文
 * 永远不会被写回，用户的文件不会被空正文覆盖。代价是它在编辑器里显示为空，
 * 因此错误必须汇入扫描报告让用户看见原因。
 */
export function applyDocumentBodies(scan: VaultScanResult): void {
  const resolveLink = createLinkResolver(scan.index)

  const convert = (relPath: string, bodyMarkdown: string): unknown | null => {
    try {
      return markdownToTiptap(bodyMarkdown, { resolveLink })
    } catch (err) {
      scan.report.unparsedBodies.push({
        relPath,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  for (const item of scan.dataset.characters) {
    const doc = convert(item.relPath, item.bodyMarkdown)
    if (doc !== null) item.entity.document = doc
  }
  for (const item of scan.dataset.countries) {
    const doc = convert(item.relPath, item.bodyMarkdown)
    if (doc !== null) item.entity.document = doc
  }
  for (const item of scan.dataset.events) {
    const doc = convert(item.relPath, item.bodyMarkdown)
    if (doc !== null) item.entity.document = doc
  }
  for (const item of scan.dataset.worldEntries) {
    const doc = convert(item.relPath, item.bodyMarkdown)
    if (doc === null) continue
    item.entity.document = doc
    // 词条编辑器读的是 content（JSON 字符串），不是 document —— 见
    // features/world/components/world-content-utils.ts 的 parseEditorContent
    item.entity.content = item.bodyMarkdown.trim() === '' ? '' : JSON.stringify(doc)
  }
}

/** 取出实体当前正文对应的编辑器文档；没有正文时返回 null */
export function documentOfEntity(kind: VaultStorableKind, entity: unknown): unknown | null {
  const record = entity as Record<string, unknown>

  if (kind === 'worldEntry') {
    const content = record.content
    if (typeof content === 'string' && content.trim() !== '') {
      try {
        const parsed: unknown = JSON.parse(content)
        if (parsed !== null && typeof parsed === 'object') return parsed
      } catch {
        // content 是纯文本（历史数据），下面回落到 document
      }
    }
    return record.document ?? null
  }

  return record.document ?? null
}

/**
 * 链接节点 → `[[...]]` 文本。
 *
 * 优先用节点上的 `raw`（装载时保留的原文），这样带锚点/别名的链接
 * （带锚点与别名的 `[[ ]]`）能**逐字**写回，不会被规范化成裸链接。
 * 编辑器里新插入的引用没有 `raw`，才回落到按名字拼。
 */
export function createLinkSerializer(
  nameOfId: (kind: VaultEntityKind, id: number) => string | undefined,
): (node: TiptapNode) => string | null {
  return (node) => {
    const raw = node.attrs?.raw
    if (typeof raw === 'string' && raw !== '') return `[[${raw}]]`

    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
    const idValue = node.attrs?.id
    const id = typeof idValue === 'string' ? Number.parseInt(idValue, 10) : Number.NaN
    const entityType = typeof node.attrs?.entityType === 'string' ? node.attrs.entityType : ''
    const kind: VaultEntityKind = node.type === 'wikiLink' ? 'worldEntry' : (entityType as VaultEntityKind)

    const name = Number.isFinite(id) ? nameOfId(kind, id) : undefined
    const text = name ?? label
    return text === '' ? null : `[[${text}]]`
  }
}

/** 图片块 → Markdown。`imageBlock` 是 app 自定义节点，attrs 是 {src, width} */
export function serializeImageBlock(node: TiptapNode): string | null {
  const src = node.attrs?.src
  if (typeof src !== 'string' || src === '') return null
  return `![](${src})`
}

export interface BodySerialization {
  markdown: string
  /** 文档含无法无损表达的内容，已附 oc-document 兜底块 */
  hasFallback: boolean
  unsupported: string[]
}

/** 实体 → 磁盘上的正文 Markdown；该类型没有正文时返回 null（表示不动正文） */
export function serializeBody(
  kind: VaultStorableKind,
  entity: unknown,
  serializeLink: (node: TiptapNode) => string | null,
): BodySerialization | null {
  if (kind === 'tag' || kind === 'period') return null

  const doc = documentOfEntity(kind, entity)
  if (doc === null) return null

  return tiptapToMarkdown(doc, { serializeLink, serializeImage: serializeImageBlock })
}
