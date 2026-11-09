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
  /** OC 动画（视频或多帧）：库里附件路径，空 = 没上传 */
  animationUrl?: string
  /** 角色文件夹名（空 / 缺省 = 未分组）；删文件夹不删角色 */
  folder?: string
  document?: unknown
  relatedCharacters: RelatedCharacter[]
  /**
   * 角色的「相关笔记」：目标只能是 `WorldEntry`。
   *
   * 与 `relatedCharacters` 分开存，因为盘上要解析的目标类型不同；
   * 形状与笔记自己的 `relations` 一致（`{ name, relation, color?, arrow? }`）。
   * 同一篇笔记在笔记侧显示为只读的「来自该角色」。
   */
  relatedNotes?: WorldRelation[]
  gallery: GalleryImage[]
  avatars: AvatarImage[]
  tags: number[]
  /** 主要角色标记（用于概览与导出首页精选） */
  isMajor?: boolean
  /** 手动排序位置（升序；缺省 = 排在已有项之后）。落盘到 frontmatter 的 `order` */
  order?: number
  /** 关系图里的坐标（用户拖过才有；落盘到 frontmatter 的 `graph_position`） */
  graphPosition?: GraphPosition
  /** 旧版武器 / 宠物标记（`kind` / `类别`）；只用于一次性导入，导入后清掉 */
  legacyKind?: string
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
  /** 图集（模板「画廊」组件；落盘键 gallery） */
  gallery?: GalleryImage[]
  // 阶段二·一收尾：国家侧的成员名单 `characters` / `events` 已从类型里摘掉 ——
  // 成员关系只有实体侧一份（`Character.countryId` / `Event.countries`），国家页的名单是查询结果。
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

/**
 * 笔记之间的关系边。
 *
 * 与 `RelatedCharacter` / `EventRelation` 同形：只存**发起方**这一侧，
 * 对方在关系块里显示为只读的「来自」。`targetId` 在盘上没有 id，靠 `name` 解析；
 * `name` 同时是目标改名后解析不到时的显示兜底（序列化会按 `targetId` 重写成当前标题）。
 */
export interface WorldRelation {
  targetId?: number
  /** 目标标题（落盘键 `name`；改名后由序列化按 targetId 重写） */
  name: string
  relation: string
  /** 连线颜色（色板名，见 lib/relation-colors.ts）；空 = 中性线色 */
  color?: string
  /** 箭头方向；空 = 无箭头 */
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
}

export interface WorldEntry {
  id: number
  title: string
  /** 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里） */
  aliases?: string[]
  content: string
  document?: unknown
  /** 分类条目的封面（3:2 槽位，落盘键 cover）；普通词条一般不设 */
  cover?: string
  /** 头像（1:1 槽位，落盘键 avatar）；模板「头像」组件写这里 */
  avatar?: string
  /** 单张图片（落盘键 image）；模板「图片」组件写这里 */
  image?: string
  /** 图集（落盘键 gallery）；模板「画廊」组件写这里 */
  gallery?: GalleryImage[]
  /**
   * 开始时间 / 结束时间（落盘键 time / endTime）。
   * 基本信息组件里的「时间 / 结束时间」特殊字段写这里（不是 `custom`）。
   */
  time?: string
  endTime?: string
  /** 地点（落盘键 location）：基本信息组件里的「地点」特殊字段写这里 */
  location?: string
  /** 一行简介（分类条目的副标题 / 列表摘要；落盘键 简介） */
  summary?: string
  /**
   * 自定义分类归属（空 = 普通词条，进世界观目录树；小说根是 `小说`、地图笔记是 `地图`）。
   *
   * 历史上它兼过层级用途，那部分早已由 `parentId` 取代；盘上仍有老文件的 `分类:` 键。
   */
  category: string
  /** 单篇覆盖的模板名（空 = 跟随分类 / 内置词条模板；落盘键 模板） */
  template?: string
  parentId: number | null
  order: number
  isConcept: boolean
  /** 地图锚点：归一化 0–1（docs/地图.md §2）；没摆过就没有这个键 */
  mapPosition?: GraphPosition
  /** 关系图坐标：分类条目进图后拖动才有的键；没摆过就交给力导向布局 */
  graphPosition?: GraphPosition
  /** 所属地图（`.ocstudio/maps/` 的文件名）；空 = 主地图 */
  mapId?: string
  /** 小说根节点：作者 / 简介 / 目标字数 / 作品笔记（其它词条不会有） */
  novelAuthor?: string
  novelSynopsis?: string
  novelTargetWords?: number
  novelNotes?: string
  /** 小说封面（2:3 槽位） */
  novelCover?: string
  /** 地图：底图相对路径 + 像素尺寸（category=地图 才有） */
  mapImage?: string
  mapWidth?: number
  mapHeight?: number
  /** 生成用的种子与参数快照（JSON 字符串） */
  mapSeed?: number
  mapParams?: string
  /** 当前显示的视图（`terrain` / `contour` / …）。只有生成过的地图才有 */
  mapMode?: string
  /** 政治标注（国界 / 道路）：JSON 字符串，坐标归一化 0–1（`features/map/annotations.ts`） */
  mapAnnotations?: string
  /** 章节：大纲 / 备注（一行说明，不是正文） */
  chapterOutline?: string
  /**
   * 手写的命名关系（目标只能是另一篇笔记）。
   *
   * 与 `parentId`（层级）和正文 `[[ ]]` / `@`（提及）**分开存**：
   * 层级只能有一个父级、正文是文字；只有「叫得出名字的关系」需要自己的格子。
   * 关系块把三类事实合在一起显示，同一目标已有命名边时不再重复显示「引用」。
   */
  relations: WorldRelation[]
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
