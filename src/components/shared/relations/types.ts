/**
 * 关系组件的公共形状（`docs/模板.md §6.3`）。
 *
 * 三个编辑器（角色 / 事件 / 国家）把各自的存储列映射成同一份 `RelationRow[]`，
 * 由 `RelationsSection` 统一渲染 —— 表格 / 紧凑 / 图三种呈现只是同一份数据的三种排法。
 * 这一层刻意不碰数据库：映射（存取哪个字段）留在各自的 form hook 里。
 */

import type { RelationArrow } from '@/lib/relation-colors'

export type RelationTargetKind = 'character' | 'event' | 'country' | 'world'

/** 三档呈现，写回模板参数 `relations.presentation` */
export type RelationPresentation = 'table' | 'compact' | 'graph'

export const RELATION_KIND_LABEL: Record<RelationTargetKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

/** 添加面板里的分组顺序（与侧栏一致：角色 → 事件 → 国家 → 词条） */
export const RELATION_KIND_ORDER: readonly RelationTargetKind[] = [
  'character',
  'event',
  'country',
  'world',
]

/**
 * 事实边的固定关系名（`docs/模板.md §6.3` / `docs/关系图.md §2.1`）。
 * 这些是成员 / 参与关系，不是用户起的名字，所以不可在表里改写。
 */
export const FACT_RELATION = {
  participates: '参与',
  belongs: '属于',
  occurredAt: '发生于',
} as const

export interface RelationRow {
  /** React key；同一目标可以有多条并行关系，所以不能只用 targetId */
  key: string
  kind: RelationTargetKind
  /** 目标实体 id；盘上只有名字、解析不到实体时为空（仍显示，但不可跳转） */
  targetId?: number
  name: string
  /** 关系名（「好朋友」/「参与」/「居民」） */
  relation: string
  /** 关系名是否能在表内改写；参与 / 归属这类事实边固定只读 */
  relationEditable: boolean
  /** 反查出来的行（「来自」）：只读，不给移除 */
  readonly?: boolean
  /** 在来源数组里的位置：移除 / 改名按它定位（同一目标可能重复） */
  index?: number
  /**
   * 这条关系有没有方向：只有「命名边」（角色↔角色、事件↔事件）才有；
   * 参与者 / 成员这类事实边没有箭头。
   */
  directional?: boolean
  /** 没存 `arrow` 时的默认方向：角色↔角色默认双向，事件↔事件默认无箭头 */
  defaultArrow?: RelationArrow
  /** 箭头方向；`undefined` = 没存（按 `defaultArrow` 显示） */
  arrow?: RelationArrow
  /** 关系线颜色（色板名）；编辑器暂不展示，留给图呈现 */
  color?: string
}

export interface RelationCandidate {
  kind: RelationTargetKind
  targetId: number
  name: string
  /** 候选列表里的第二行（别名 / 时间） */
  subtitle?: string
}

/** 只有三档；写坏的参数一律回落到表格 */
export function normalizeRelationPresentation(value: unknown): RelationPresentation {
  return value === 'compact' || value === 'graph' ? value : 'table'
}
