/**
 * 关系边的样式（颜色 / 箭头）更新（W4 功能层）。
 *
 * 边上这两个值是**数据**，落在实体 frontmatter 的 `relations[]` 里（`docs/关系图.md` §2.1）：
 * - 颜色：色板名（`lib/relation-colors`），非法值回落到「不设」
 * - 箭头：`none / forward / reverse / both`；`none` 是**显式无箭头**，必须保留
 *   （角色边不写 = 默认双向，清成 `undefined` 会把「无箭头」又变回双向）
 *
 * 纯函数负责「怎么改一条边」，service 负责落库与日志，这样子可测、写盘只有一处。
 */
import { normalizeRelationArrow, normalizeRelationColor, type RelationArrow } from '@/lib/relation-colors'
import type { Character, Event, RelatedCharacter, WorldEntry, WorldRelation } from '@/types'

export interface EdgeStylePatch {
  /** `undefined` = 不动；`null` = 清空回默认 */
  color?: string | null
  arrow?: RelationArrow | null
  /** 关系名（改名）；空串 / `null` 视为不改 */
  relation?: string | null
}

export interface EdgeStyle {
  color?: string
  arrow?: RelationArrow
}

/** 读一条边现有的样式（缺省都是 undefined） */
export function edgeStyleOf(edge: { color?: string; arrow?: RelationArrow }): EdgeStyle {
  return { color: edge.color, arrow: edge.arrow }
}

/**
 * 把补丁合并到一个边上，返回「要不要写」。
 * 合并后两者都没有 → `color` / `arrow` 键会被移除（不写空值进文件）。
 */
export function applyEdgeStyle<T extends { color?: string; arrow?: RelationArrow; relation?: string }>(
  edge: T,
  patch: EdgeStylePatch,
): { edge: T; changed: boolean } {
  let color = edge.color
  let arrow = edge.arrow
  let relation = edge.relation

  if (patch.color !== undefined) {
    const next = patch.color === null ? undefined : normalizeRelationColor(patch.color)
    color = next
  }
  if (patch.arrow !== undefined) {
    arrow = patch.arrow === null ? undefined : normalizeRelationArrow(patch.arrow, 'none')
  }

  if (patch.relation !== undefined && patch.relation !== null) {
    const next = patch.relation.trim().slice(0, 40)
    if (next !== '') relation = next
  }

  const changed = color !== edge.color || arrow !== edge.arrow || relation !== edge.relation
  const next: T = { ...edge }
  if (color === undefined) delete (next as { color?: string }).color
  else next.color = color
  if (arrow === undefined) delete (next as { arrow?: RelationArrow }).arrow
  else next.arrow = arrow
  if (relation !== undefined) (next as { relation?: string }).relation = relation
  return { edge: next, changed }
}

/** 角色侧：改 `relatedCharacters` 里指向 targetId 的那一条；没这条边返回 null */
export function patchCharacterEdge(
  character: Character,
  targetId: number,
  patch: EdgeStylePatch,
): { relatedCharacters: RelatedCharacter[]; changed: boolean; found: boolean } | null {
  const list = character.relatedCharacters ?? []
  const index = list.findIndex((item) => item.characterId === targetId)
  if (index < 0) return null
  const { edge, changed } = applyEdgeStyle(list[index], patch)
  if (!changed) return { relatedCharacters: list, changed: false, found: true }
  const next = [...list]
  next[index] = edge
  return { relatedCharacters: next, changed: true, found: true }
}

/** 事件侧：改 `relations` 里指向 targetId 的那一条 */
export function patchEventEdge(
  event: Event,
  targetId: number,
  patch: EdgeStylePatch,
): { relations: Event['relations']; changed: boolean; found: boolean } | null {
  const list = event.relations ?? []
  const index = list.findIndex((item) => item.targetId === targetId)
  if (index < 0) return null
  const { edge, changed } = applyEdgeStyle(list[index], patch)
  if (!changed) return { relations: list, changed: false, found: true }
  const next = [...list]
  next[index] = edge
  return { relations: next, changed: true, found: true }
}

/** 笔记侧：改 `relations` 里指向 targetId 的那一条 */
export function patchWorldEdge(
  entry: WorldEntry,
  targetId: number,
  patch: EdgeStylePatch,
): { relations: WorldRelation[]; changed: boolean; found: boolean } | null {
  const list = entry.relations ?? []
  const index = list.findIndex((item) => item.targetId === targetId)
  if (index < 0) return null
  const { edge, changed } = applyEdgeStyle(list[index], patch)
  if (!changed) return { relations: list, changed: false, found: true }
  const next = [...list]
  next[index] = edge
  return { relations: next, changed: true, found: true }
}
