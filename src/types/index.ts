export interface RelatedCharacter {
  characterId?: number
  name: string
  relation: string
  /** 连线颜色（色板名，见 lib/relation-colors.ts）；空 = 中性线色 */
  color?: string
  /** 箭头方向；空 = 无箭头 */
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
}

export interface GalleryImage {
  url: string
  caption?: string
}

export interface AvatarImage {
  url: string
  type: 'portrait' | 'fullbody' | 'other'
}

/** 关系图坐标：用户把节点拖到哪里就记在哪里（仓库写 frontmatter 的 `graph_position`） */
export interface GraphPosition {
  x: number
  y: number
}

export interface Character {
  id: number
  name: string
  aliases: string[]
  race: string
  element: string
  occupation: string
  /** 阵营 / 立场（vault 侧 frontmatter 键：阵营 或 faction）。自由文本，不强制归一 */
  faction: string
  /**
   * 阵营名解析到的实体 id（软引用）。
   * 阵营值多为叙事性描述，磁盘上没有稳定标识，因此按**名字**解析：
   * 命中同名文件名或别名即可跳转，未命中就保持纯文本并计入扫描报告。
   */
  factionId?: number
  nationalityLegacy: string
  countryId?: number
  height: string
  birthday: string
  avatarUrl: string
  headerUrl?: string
  bio: string
  lifeStory: string
  /** 角色文件夹名（空 / 缺省 = 未分组）；删文件夹不删角色 */
  folder?: string
  document?: unknown
  relatedCharacters: RelatedCharacter[]
  gallery: GalleryImage[]
  avatars: AvatarImage[]
  tags: number[]
  /** 主要角色标记（用于概览与导出首页精选） */
  isMajor?: boolean
  /** 手动排序位置（升序；缺省 = 排在已有项之后）。落盘到 frontmatter 的 `order` */
  order?: number
  /** 关系图里的坐标（用户拖过才有；落盘到 frontmatter 的 `graph_position`） */
  graphPosition?: GraphPosition
  createdAt: number
  /** 自定义字段的值（键 = 字段表里的 key；内置字段仍然走各自的列） */
  custom?: Record<string, string>
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface Event {
  id: number
  title: string
  /** 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里） */
  aliases?: string[]
  time: string
  endTime?: string
  location: string
  summary: string
  content: string
  document?: unknown
  characters: number[]
  countries?: number[]
  headerUrl?: string
  parentEventId: number | null
  relations: EventRelation[]
  tags: number[]
  images: ImageEntry[]
  isMajor: boolean
  /** 手动排序位置（升序；缺省 = 排在已有项之后） */
  order?: number
  /** 关系图里的坐标（用户拖过才有） */
  graphPosition?: GraphPosition
  /** 地图锚点：归一化 0–1（docs/地图.md §2）；没摆过就没有这个键 */
  mapPosition?: GraphPosition
  /** 所属地图（`.ocstudio/maps/` 的文件名）；空 = 主地图 */
  mapId?: string
  createdAt: number
  /** 自定义字段的值（键 = 字段表里的 key；内置字段仍然走各自的列） */
  custom?: Record<string, string>
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface EventRelation {
  targetId: number
  relation: string
  /** 连线颜色（色板名）；空 = 中性线色 */
  color?: string
  /** 箭头方向；空 = 无箭头 */
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
}

export interface ImageEntry {
  url: string
  caption: string
}

export interface Country {
  id: number
  name: string
  /** 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里） */
  aliases?: string[]
  parentId: number | null
  description: string
  document?: unknown
  system: string
  geography: string
  culture: string
  flagUrl?: string
  headerUrl?: string
  characters: number[]
  events: number[]
  tags: number[]
  /** 手动排序位置（升序；缺省 = 排在已有项之后） */
  order?: number
  /** 关系图里的坐标（用户拖过才有） */
  graphPosition?: GraphPosition
  /** 地图锚点：归一化 0–1（docs/地图.md §2）；没摆过就没有这个键 */
  mapPosition?: GraphPosition
  /** 所属地图（`.ocstudio/maps/` 的文件名）；空 = 主地图 */
  mapId?: string
  createdAt: number
  /** 自定义字段的值（键 = 字段表里的 key；内置字段仍然走各自的列） */
  custom?: Record<string, string>
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface WorldEntry {
  id: number
  title: string
  /** 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里） */
  aliases?: string[]
  content: string
  document?: unknown
  /**
   * 历史字段（已废弃）：层级只由 `parentId` 表达，界面不再编辑、新条目一律空。
   * 保留是为了读得懂老数据和已有 vault 文件里的 `分类:` 键 —— 写回时也不再动它。
   */
  category: string
  parentId: number | null
  order: number
  isConcept: boolean
  /** 地图锚点：归一化 0–1（docs/地图.md §2）；没摆过就没有这个键 */
  mapPosition?: GraphPosition
  /** 所属地图（`.ocstudio/maps/` 的文件名）；空 = 主地图 */
  mapId?: string
  /** 小说根节点：作者 / 简介 / 目标字数 / 作品笔记（其它词条不会有） */
  novelAuthor?: string
  novelSynopsis?: string
  novelTargetWords?: number
  novelNotes?: string
  /** 小说封面（2:3 槽位） */
  novelCover?: string
  /** 章节：大纲 / 备注（一行说明，不是正文） */
  chapterOutline?: string
  references: WorldReference[]
  tags: number[]
  /** 自定义字段的值（键 = 字段表里的 key；内置字段仍然走各自的列） */
  custom?: Record<string, string>
  createdAt: number
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface WorldReference {
  targetType: string
  targetId: number
}

export interface Tag {
  id: number
  name: string
  category: string
  color: string
}

export interface OperationLog {
  id: number
  timestamp: number
  targetType: string
  targetId: number
  field: string
  oldValue: string
  newValue: string
}

export interface Period {
  id: number
  name: string
  startTime: string
  endTime: string
  color: string
  _syncStatus?: string
  _lastModified?: number
  deleted?: boolean
}

/** 项目级元信息（单例记录，id 固定为 1）。用于应用标题与导出站点的标题/简介/封面。 */
export interface ProjectMeta {
  id: number
  worldName: string
  tagline: string
  coverUrl: string
  updatedAt: number
  /** 字段表（没有文件夹时存这里；有文件夹时在 .ocstudio/fields.json） */
  fields?: Record<string, unknown>
  _syncStatus?: string
  _lastModified?: number
}

export const PERIOD_COLORS = [
  { label: '暖灰', value: 'bg-paper-card', hex: '#F3EFE9', hexDark: '#2D2B28' },
  { label: '线灰', value: 'bg-line', hex: '#E7E3DC', hexDark: '#38352F' },
  { label: '深灰', value: 'bg-ink-muted', hex: '#6E6A63', hexDark: '#A5A098' },
  { label: '淡灰', value: 'bg-ink-faint', hex: '#A5A098', hexDark: '#6E6A63' },
  { label: '暖黄', value: 'bg-warning', hex: '#C68D44', hexDark: '#C68D44' },
  { label: '暖红', value: 'bg-error', hex: '#B36651', hexDark: '#B36651' },
] as const
