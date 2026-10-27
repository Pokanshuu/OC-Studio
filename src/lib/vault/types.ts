import type {
  Character,
  Country,
  Event,
  Period,
  ProjectMeta,
  Tag,
  WorldEntry,
} from '@/types'

// ── Vault 解析层的共享类型 ────────────────────────────────────────────────
// 这一层是**纯函数**：输入「一堆文件的原文」，输出「实体数据集 + 扫描报告」。
// 不依赖 Tauri / Dexie / DOM，因此可以在 Node 里离线跑（见 scripts/vault-analyze.ts），
// 真正读盘由 Rust 命令承担（src-tauri/src/vault.rs）。

/** 扫描到的单个文本文件（由 Rust 命令或离线脚本提供） */
export interface VaultFileEntry {
  /** vault 根相对路径，一律正斜杠分隔 */
  relPath: string
  content: string
  size: number
  mtimeMs: number
}

/** 扫描输入 */
export interface VaultScanInput {
  root: string
  files: VaultFileEntry[]
  /** 扫描时跳过的目录（报告用） */
  skippedDirs: string[]
}

/** 正文里的一处 [[ ]] 链接 */
export interface WikiLink {
  /** [[目标]] 或 [[目标|别名]] 里的目标（已去锚点 #） */
  target: string
  /** 别名部分（[[目标|别名]] 的别名） */
  alias?: string
  /** 原文，便于原样回写 */
  raw: string
  /** 是否嵌入（![[...]]）。嵌入指向附件而非实体，不参与实体链接解析 */
  embed: boolean
}

/** 一个 .md 文件解析后的形态 */
export interface VaultNote {
  relPath: string
  /** 所在目录（正斜杠，根目录为 ''） */
  folder: string
  /** 文件名（去 .md），同时是链接的解析键 */
  basename: string
  /** frontmatter 原文键值；无 frontmatter 时为空对象 */
  frontmatter: Record<string, unknown>
  /** frontmatter 之后的正文（Markdown） */
  body: string
  links: WikiLink[]
  size: number
  mtimeMs: number
}

/** 一个文件映射成的实体类型 */
export type VaultEntityKind =
  | 'character'
  | 'event'
  | 'country'
  | 'worldEntry'
  | 'tag'
  | 'period'
  | 'ignore'

/** 可落库的实体类型（不含 ignore） */
export type VaultStorableKind = Exclude<VaultEntityKind, 'ignore'>

/** 文件夹 → 实体类型规则。按 prefix 长度从长到短匹配，先命中者生效。 */
export interface VaultFolderRule {
  /** 目录前缀，如 '20.角色'；'' 表示 vault 根 */
  prefix: string
  kind: VaultEntityKind
  /** worldEntry 的默认分类（缺省取所在目录名） */
  category?: string
}

/** 已被解析出的实体 + 它的来源文件 */
export interface LoadedEntity<T> {
  entity: T
  /** 来源文件的 vault 相对路径；空串表示该实体没有对应文件（如纯 frontmatter 标签） */
  relPath: string
  /**
   * 正文 Markdown 原文。
   * 结构（实体字段）与文本（正文）分两步处理：扫描层只负责前者，
   * `document` 由 markdown 桥在后续一遍里填充，因此扫描层可以独立验证。
   */
  bodyMarkdown: string
}

/** 链接解析目标 */
export interface VaultTarget {
  kind: VaultEntityKind
  relPath: string
  /** 展示名（frontmatter.title，回落文件名） */
  title: string
  /** 本次装载分配到的实体 id */
  id: number
}

/** 装载期建立的解析索引（正文桥与写回都要用） */
export interface VaultIndex {
  /** 解析键（文件名或别名，已归一）→ 候选目标；长度 >1 表示歧义 */
  byKey: Map<string, VaultTarget[]>
  /** vault 相对路径 → 目标 */
  byPath: Map<string, VaultTarget>
}

/** 实体的落库数据集 */
export interface VaultDataset {
  characters: LoadedEntity<Character>[]
  events: LoadedEntity<Event>[]
  countries: LoadedEntity<Country>[]
  worldEntries: LoadedEntity<WorldEntry>[]
  tags: LoadedEntity<Tag>[]
  periods: LoadedEntity<Period>[]
  project: LoadedEntity<ProjectMeta> | null
  /** 未映射成任何实体的文件（原样保留，不写回） */
  ignored: string[]
}

/** 单条链接的解析结果 */
export interface LinkResolution {
  target: string
  /** 该目标出现的次数 */
  count: number
  /** 解析到的文件；未能解析为 null */
  resolvedTo: { kind: VaultEntityKind; relPath: string } | null
  /** 解析途径：文件名 / 别名 / 未解析 */
  via: 'basename' | 'alias' | 'none'
  /** 命中多个文件时的候选（视为歧义，不做自动选择） */
  ambiguous: string[]
  /** 出现在哪些文件里（最多若干条，报告用） */
  sources: string[]
}

/** 一条别名冲突：同一别名被多个文件声明 */
export interface AliasConflict {
  alias: string
  paths: string[]
}

/** 同一解析键（文件名或别名）指向多个文件 */
export interface DuplicateKey {
  key: string
  paths: string[]
}

/** 扫描报告：导入前给用户看的体检结果，不含任何写入 */
export interface VaultScanReport {
  root: string
  noteCount: number
  /** 扫描时跳过的目录（.obsidian / .git 等） */
  skippedDirs: string[]
  /** 各实体类型的文件数 */
  byKind: Record<VaultEntityKind, number>
  /** 目录 → 规则的命中情况 */
  folders: { folder: string; rule: string; kind: VaultEntityKind; count: number }[]
  links: {
    total: number
    distinct: number
    resolved: number
    viaAlias: number
    unresolved: LinkResolution[]
    ambiguous: LinkResolution[]
  }
  aliases: {
    total: number
    /** 别名与正文引用完全对得上的（最有价值的那部分） */
    usedByLinks: number
    conflicts: AliasConflict[]
  }
  /**
   * 阵营名没有对应词条的（软引用未命中）。
   * 阵营是自由文本，命中同名词条就能跳转；这里列出还没建的，
   * 供「一键创建阵营词条」用。
   */
  unresolvedFactions: { name: string; count: number; sources: string[] }[]
  duplicateKeys: DuplicateKey[]
  emptyFiles: string[]
  /** 未能映射成任何实体的文件（目录不在关键词表里） */
  unmapped: { relPath: string; folder: string }[]
  /** frontmatter 解析失败的文件 */
  unparsedFrontmatter: { relPath: string; error: string }[]
  /**
   * 正文无法解析的文件（例如 `oc-document` 兜底块被手工改坏）。
   * 这类文件**不装载文档**，因此正文永远不会被写回覆盖 —— 代价是编辑器里显示为空。
   */
  unparsedBodies: { relPath: string; error: string }[]
  /** frontmatter 键频次（用于判断哪些键是约定俗成的） */
  frontmatterKeys: { key: string; count: number }[]
}

/** 扫描的完整产物：数据集 + 报告 + 解析索引 */
export interface VaultScanResult {
  dataset: VaultDataset
  report: VaultScanReport
  index: VaultIndex
  /** 全部笔记（正文桥与写回都要用） */
  notes: VaultNote[]
}
