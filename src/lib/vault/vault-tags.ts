import { normalizeTagColor } from '@/lib/tag-colors'
import type { Tag } from '@/types'

// ── .ocstudio/tags.json ─────────────────────────────────────────────────
// 标签的颜色/分类是 **app 侧元数据**：vault 里标签只以名字出现在各实体的
// frontmatter `tags` 数组里（这样 Obsidian 的 tag 面板能直接用）。
// 若为每个标签建一个 .md，导入一个 187 标签的 vault 就会撒出 187 个碎文件。
// 因此集中放一个文件，和 `.obsidian/` 的定位一致。

export const TAG_META_VERSION = 1

export interface TagMetaEntry {
  color: string
  category: string
}

export type TagMetaMap = Map<string, TagMetaEntry>

interface TagMetaFile {
  version: number
  tags: Record<string, { color?: unknown; category?: unknown }>
}

/** 解析 tags.json 原文；坏数据一律降级为空表，不阻断装载 */
export function parseTagMeta(content: string | null): TagMetaMap {
  const map: TagMetaMap = new Map()
  if (content === null || content.trim() === '') return map

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return map
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return map

  const tags = (parsed as TagMetaFile).tags
  if (tags === null || typeof tags !== 'object' || Array.isArray(tags)) return map

  for (const [name, value] of Object.entries(tags)) {
    if (name.trim() === '') continue
    const record = (value ?? {}) as Record<string, unknown>
    map.set(name, {
      color: typeof record.color === 'string' ? record.color : '',
      category: typeof record.category === 'string' ? record.category : '',
    })
  }
  return map
}

export function serializeTagMeta(map: TagMetaMap): string {
  const tags: Record<string, { color: string; category: string }> = {}
  for (const name of [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans'))) {
    const entry = map.get(name)
    if (entry === undefined) continue
    tags[name] = { color: entry.color, category: entry.category }
  }
  return `${JSON.stringify({ version: TAG_META_VERSION, tags }, null, 2)}\n`
}

/**
 * 把 tags.json 里的元数据盖到扫描出的标签上。
 * 颜色非法（不在预设色板里）时回落到按名字派生的颜色 —— 导入的 vault 可能带任意字符串。
 */
export function applyTagMeta(tags: Tag[], map: TagMetaMap): Tag[] {
  return tags.map((tag) => {
    const entry = map.get(tag.name)
    if (entry === undefined) return tag
    return {
      ...tag,
      color: normalizeTagColor(entry.color === '' ? tag.color : entry.color, tag.name),
      category: entry.category === '' ? tag.category : entry.category,
    }
  })
}

/** 标签表 → 元数据文件（写回时用） */
export function tagMetaFromTags(tags: Tag[]): TagMetaMap {
  const map: TagMetaMap = new Map()
  for (const tag of tags) {
    map.set(tag.name, { color: tag.color, category: tag.category })
  }
  return map
}
