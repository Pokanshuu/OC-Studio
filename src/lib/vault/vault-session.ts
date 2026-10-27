import type { VaultStorableKind } from './types'

// ── 当前打开的 vault 会话 ───────────────────────────────────────────────
// 会话 = 「磁盘上装载了什么」的内存镜像。写回逻辑靠它做两件事：
//   1. 找到实体的来源文件（`byPath` / `entries`）
//   2. 拿到**原文与装载时的原值**，才能做到「未改动就不写」

export type VaultTableName =
  | 'characters'
  | 'events'
  | 'countries'
  | 'worldEntries'
  | 'tags'
  | 'periods'
  | 'meta'

/** 表名 → 实体类型；meta 是单例项目元信息，走标记文件而不是 .md */
export const KIND_BY_TABLE: Record<VaultTableName, VaultStorableKind | null> = {
  characters: 'character',
  events: 'event',
  countries: 'country',
  worldEntries: 'worldEntry',
  tags: 'tag',
  periods: 'period',
  meta: null,
}

export const VAULT_TABLES: VaultTableName[] = [
  'characters',
  'events',
  'countries',
  'worldEntries',
  'tags',
  'periods',
  'meta',
]

/** 一个实体在磁盘上的状态 */
export interface VaultEntryState {
  table: VaultTableName
  id: number
  kind: VaultStorableKind
  /** vault 相对路径；空串表示该实体还没有文件（如纯 frontmatter 标签） */
  relPath: string
  /** 装载时该文件的**原文**：写回时按它逐键替换，未知内容一个字节都不动 */
  content: string
  /** 磁盘 mtime：乐观并发的基准 */
  mtimeMs: number
  /** 装载时的实体：写回时的 diff 基准（未改动就不写） */
  entity: unknown
  /** 装载时的 frontmatter：决定沿用哪个键名（`阵营` 还是 `faction`） */
  frontmatter: Record<string, unknown>
  /** 装载时的正文 Markdown：正文没变就不重写正文部分 */
  bodyMarkdown: string
  /**
   * 装载时正文对应的编辑器文档（JSON 字符串）。
   *
   * 为什么比较文档而不是比较正文文本：Markdown 序列化器天然会**规范化**排版
   * （表格分隔行长度、`***` 与 `---`、转义策略…），所以「序列化结果 === 原文」
   * 这个判据几乎永远为假，会导致没编辑过的笔记也被重写一遍正文。
   * 比较文档则准确对应「用户是否真的改了这篇的正文」。
   */
  bodyDoc: string
  /** 是否位于回收站 */
  trashed: boolean
}

/** 标签元数据（颜色/分类）—— app 侧数据，集中放一个文件而不是撒 187 个 .md */
export interface VaultTagMeta {
  relPath: string
  /** 文件原文；null 表示还没建过 */
  content: string | null
  /** 标签名 → 元数据 */
  entries: Map<string, { color: string; category: string }>
  dirty: boolean
}

export interface VaultSession {
  root: string
  entries: Map<string, VaultEntryState>
  byPath: Map<string, string>
  /** 已占用的全部路径（含被忽略的非实体文件），新文件分配时用于去重 */
  occupied: Set<string>
  /** 标记文件；没建过则为 null（外来 vault 不会被自动写入标记） */
  marker: { relPath: string; content: string } | null
  tagMeta: VaultTagMeta
}

export const TAG_META_REL_PATH = '.ocstudio/tags.json'

export function entityKey(table: VaultTableName, id: number): string {
  return `${table}:${id}`
}

let activeSession: VaultSession | null = null

export function getVaultSession(): VaultSession | null {
  return activeSession
}

export function setVaultSession(session: VaultSession | null): void {
  activeSession = session
}

/** 新建一个空会话（装载过程逐步填充） */
export function createVaultSession(root: string): VaultSession {
  return {
    root,
    entries: new Map(),
    byPath: new Map(),
    occupied: new Set(),
    marker: null,
    tagMeta: {
      relPath: TAG_META_REL_PATH,
      content: null,
      entries: new Map(),
      dirty: false,
    },
  }
}
