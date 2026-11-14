import { markdownToTiptap, tiptapToMarkdown, type LinkRef, type ResolvedLink, type TiptapNode } from './markdown'
import { normalizeLinkKey } from './wikilink'
import { imageMarkdown } from './markdown/image-src'
import { readStoredBody } from '@/lib/body-content'
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
    // 词条**只写 document**（`lib/world-body.ts`）：以前这里还顺手把同一份正文
    // 序列化进 `content` 伺候老编辑器，两份真源必然漂，已收敛。
    item.entity.content = ''
  }
}

/** 取出实体当前正文对应的编辑器文档；没有正文时返回 null */
export function documentOfEntity(kind: VaultStorableKind, entity: unknown): unknown | null {
  const record = entity as Record<string, unknown>
  const document = readStoredBody(record.document)

  // 词条：`document` 是正字段，`content` 只剩老数据兜底（`lib/world-body.ts`）
  if (kind === 'worldEntry') {
    if (document !== null && typeof document === 'object') return document
    const content = record.content
    if (typeof content === 'string' && content.trim() !== '') {
      try {
        const parsed: unknown = JSON.parse(content)
        if (parsed !== null && typeof parsed === 'object') return parsed
      } catch {
        // content 是纯文本（历史数据），交给调用方按纯文本处理
      }
    }
    return null
  }

  return document
}

/**
 * 链接节点 → `[[...]]` 文本。
 *
 * 优先用节点上的 `raw`（装载时保留的原文），这样带锚点/别名的链接
 * （带锚点与别名的 `[[ ]]`）能**逐字**写回，不会被规范化成裸链接。
 * 编辑器里新插入的引用没有 `raw`，才回落到按 id 反查。
 *
 * `fileBaseOfId` 是目标在磁盘上的文件名（已去 `NN.` 之外的扩展名）。
 * vault 里词条文件常带 `00.` / `02.` 这类序号前缀（用户自己的排序习惯），
 * 只写标题的话 Obsidian 根本解析不到 —— 于是写成 `[[02.元素与生命树|元素与生命树]]`：
 * 目标可解析，显示名仍是标题。
 *
 * **目标解析不到时写纯文本**（返回 null，由 `to-markdown` 按文字输出）：
 * 目标被删 / 导入时解除跳转的引用，如果还写成 `[[名字]]`，下次扫描会按名字
 * 绑到**同名的另一条实体**上（审查报告 Q02）。文字留着、链接不再成立，
 * 与「目标被删后保留名字、不可点」的产品口径一致。
 *
 * `attrs.anchor`（`#锚点`）由导入重绑定从旧 raw 里解析出来单独保存 ——
 * 目标换了落库身份时 raw 不能再用，但锚点是用户的跳转意图，必须拼回去。
 */
export function createLinkSerializer(
  nameOfId: (kind: VaultEntityKind, id: number) => string | undefined,
  fileBaseOfId?: (kind: VaultEntityKind, id: number) => string | undefined,
): (node: TiptapNode) => string | null {
  return (node) => {
    const raw = node.attrs?.raw
    if (typeof raw === 'string' && raw !== '') return `[[${raw}]]`

    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : ''
    const anchor =
      typeof node.attrs?.anchor === 'string' && node.attrs.anchor !== ''
        ? node.attrs.anchor
        : undefined
    const idValue = node.attrs?.id
    const id = refIdOf(idValue)
    const entityType = typeof node.attrs?.entityType === 'string' ? node.attrs.entityType : ''
    const kind: VaultEntityKind = node.type === 'wikiLink' ? 'worldEntry' : (entityType as VaultEntityKind)

    const name = id === null ? undefined : nameOfId(kind, id)
    const fileBase = id === null ? undefined : fileBaseOfId?.(kind, id)
    const target = fileBase !== undefined && fileBase !== '' ? fileBase : name
    // 解析不到目标：只写可读文字，绝不写出会被同名实体重新解析的 [[ ]]
    if (target === undefined || target === '') return null

    const anchorPart = anchor === undefined ? '' : `#${anchor}`
    // 显示名优先用 label：它是用户写下的名字 / 别名（导入重绑定会丢掉 raw，
    // 别名只剩 label 这一份）。`|`、`[`、`]`、换行会破坏 `[[ ]]` 语法，这类退回实体名。
    const usableLabel = label.trim() !== '' && !/[|\[\]\n]/.test(label) ? label : ''
    const display = usableLabel !== '' ? usableLabel : (name ?? '')
    if (display !== '' && display !== target) return `[[${target}${anchorPart}|${display}]]`
    return `[[${target}${anchorPart}]]`
  }
}

/** 节点 attrs.id 可能是字符串（编辑器写入）或数字（老数据）；不是 id 返回 null */
function refIdOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  const id = Number.parseInt(text, 10)
  return Number.isFinite(id) ? id : null
}

/** 图片块 → Markdown。`imageBlock` 是 app 自定义节点，attrs 是 {src, width} */
export function serializeImageBlock(node: TiptapNode): string | null {
  const src = node.attrs?.src
  if (typeof src !== 'string' || src === '') return null
  return imageMarkdown(src)
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
