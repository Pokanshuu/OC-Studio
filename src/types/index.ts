export interface RelatedCharacter {
  characterId?: number
  name: string
  relation: string
  /** 指向具体关系记录；同一对角色可以有多条关系线。 */
  relationId?: string
}

export interface GalleryImage {
  url: string
  caption?: string
}

export interface AvatarImage {
  url: string
  type: 'portrait' | 'fullbody' | 'other'
}

export interface CharacterCustomField {
  id: string
  label: string
  value: string
}

export type CharacterKind = 'character' | 'weapon' | 'pet'

export interface Character {
  id?: number
  name: string
  /** 复用角色模板的实体类型；旧数据没有该字段时按 character 处理。 */
  entityKind?: CharacterKind
  accentColor?: string
  customFields?: CharacterCustomField[]
  /** 所属角色文件夹；null/undefined 表示未分类。文件夹元数据存于本地。 */
  folderId?: string | null
  /** 被用户隐藏的内置基本信息字段 key。 */
  hiddenFields?: string[]
  /** 上传的 OC 动画（mp4/webm/gif/webp）。 */
  animationUrl?: string
  /** 动画类型，用于选择 video 或 img 预览。 */
  animationType?: 'video' | 'image'
  aliases: string[]
  race: string
  element: string
  occupation: string
  nationalityLegacy: string
  countryId?: number
  height: string
  birthday: string
  gender?: string
  orientation?: string
  age?: string
  weight?: string
  bloodType?: string
  hairColor?: string
  eyeColor?: string
  birthplace?: string
  residence?: string
  personality?: string
  hobbies?: string
  skills?: string
  affiliation?: string
  weapon?: string
  pet?: string
  ability?: string
  status?: string
  avatarUrl: string
  qAvatarUrl?: string
  headerUrl?: string
  bio: string
  lifeStory: string
  document?: unknown
  relationships: Relationship[]
  relatedCharacters: RelatedCharacter[]
  /** 与国家的关系投影；国家面板与关系图共用。 */
  relatedNations?: number[]
  /** 与国家的边标签，供关系图/面板双向同步。 */
  relatedNationLabels?: Record<number, string>
  /** 与事件的关系投影；事件面板与关系图共用。 */
  relatedEvents?: number[]
  relatedEventLabels?: Record<number, string>
  gallery: GalleryImage[]
  avatars: AvatarImage[]
  tags: number[]
  createdAt: number
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface Relationship {
  targetId: number
  targetType: string
  relation: string
}

export interface Event {
  id?: number
  title: string
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
  createdAt: number
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface EventRelation {
  targetId: number
  relation: string
}

export interface ImageEntry {
  url: string
  caption: string
}

export interface Country {
  id?: number
  name: string
  accentColor?: string
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
  /** 国家之间的关系投影；关系图写入时同步。 */
  relatedNations?: number[]
  relatedNationLabels?: Record<number, string>
  /** 国家与事件的关系投影；事件面板写入时同步。 */
  relatedEvents?: number[]
  relatedEventLabels?: Record<number, string>
  tags: number[]
  createdAt: number
  updatedAt: number
  deleted: boolean
  _syncStatus: string
  _lastModified: number
}

export interface WorldEntry {
  id?: number
  title: string
  content: string
  document?: unknown
  category: string
  parentId: number | null
  order: number
  isConcept: boolean
  references: WorldReference[]
  tags: number[]
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
  id?: number
  name: string
  category: string
  color: string
}

export interface OperationLog {
  id?: number
  timestamp: number
  targetType: string
  targetId: number
  field: string
  oldValue: string
  newValue: string
}

export interface Period {
  id?: number
  name: string
  startTime: string
  endTime: string
  color: string
  _syncStatus?: string
  _lastModified?: number
  deleted?: boolean
}

export type WorldMapKind = 'world' | 'region'

export type RelationEntityType = 'character' | 'country' | 'event'
export type RelationKind =
  | 'character'
  | 'membership'
  | 'event-character'
  | 'event-country'
  | 'event-event'
  | 'nation'
  | 'custom'

/**
 * 关系图的唯一真相源。
 * 旧的角色/国家/事件数组保留为投影，供现有面板读取。
 */
export interface RelationRecord {
  id: string
  sourceType: RelationEntityType
  sourceId: number
  targetType: RelationEntityType
  targetId: number
  kind: RelationKind
  label: string
  directed: boolean
  /** 关系线固定色板中的颜色；未设置为默认线色。 */
  color?: string
  /** 箭头方向：none / forward / reverse / both。 */
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface MapAnnotationPoint {
  x: number
  y: number
}

export interface MapAnnotation {
  id: string
  type: 'polygon' | 'city' | 'road'
  name: string
  color: string
  points: MapAnnotationPoint[]
  note?: string
  linkedEntity?: {
    type: 'country' | 'character' | 'event'
    id: number
  }
}

export type TerrainPreset = 'earth' | 'three-continents' | 'islands' | 'pangaea' | 'custom'

export interface WorldMapParams {
  kind: WorldMapKind
  /** 大陆分布预设；旧地图没有该字段时按 earth 处理。 */
  terrainPreset?: TerrainPreset
  /** 生成宽高；世界地图默认 2048×1024，区域地图默认 1024×1024。 */
  width: number
  height: number
  /** 旧版记录兼容字段；新生成逻辑使用 width/height。 */
  size?: number
  /** 目标陆地比例，0..1。 */
  landCoverage: number
  /** 山脉带强度，0..1。 */
  mountainStrength: number
  /** 高原/碰撞抬升强度，0..1。 */
  plateauStrength: number
  /** 平原偏置，-1..1；越高低地越平坦。 */
  plainBias: number
  /** 湖泊密度，0..1。 */
  lakeDensity: number
  /** 最小湖泊面积占地图总格数比例。 */
  lakeMinArea: number
  /** 最大湖泊面积占地图总格数比例。 */
  lakeMaxArea: number
  /** 全球温度偏移，摄氏度。 */
  temperatureOffset: number
  /** 降水偏置，-1..1。 */
  moistureBias: number
  /** 河流密度，0..1；越高阈值越低。 */
  riverDensity: number
  /** 地图覆盖的纬度范围（度），默认 150（南纬 75 到北纬 75）。 */
  latitudeSpan: number
}

export interface WorldMapRecord {
  id?: number
  name: string
  seed: number
  params: WorldMapParams
  createdAt: number
  updatedAt: number
  deleted: boolean
  annotations?: MapAnnotation[]
  thumbnail?: string
  /** 完整地图 PNG；地图管理导出 PNG/JPG 与 .ocmap 时使用。 */
  imageBlob?: Blob
  /** 手绘修饰层（透明 PNG），覆盖在生成图之上。 */
  paintBlob?: Blob
  /** 生成/编辑后的国家、城市与归属网格。 */
  political?: unknown
  /** 用户明确采纳该地图的时间；保存不等于采纳。 */
  acceptedAt?: number
  isTemplate?: boolean
  /** 区域地图叠放到世界地图时的父地图。 */
  parentWorldId?: number
  /** 地图关联的 OC 实体；仅保存引用，实体名称从对应表实时读取。 */
  linkedEntities?: Array<{
    type: 'country' | 'character' | 'event'
    id: number
  }>
  /** 归一化位置/尺寸（0..1），相对世界地图。 */
  placement?: {
    x: number
    y: number
    width: number
    height: number
  }
  /** 最近一次生成时的统计快照，便于导出与列表展示。 */
  stats?: {
    landRatio: number
    maxElevation: number
    riverCells: number
    lakeCount: number
    biomeCount: number
  }
}

export const PERIOD_COLORS = [
  { label: '暖灰', value: 'bg-paper-card', hex: '#F3EFE9', hexDark: '#2D2B28' },
  { label: '线灰', value: 'bg-line', hex: '#E7E3DC', hexDark: '#38352F' },
  { label: '深灰', value: 'bg-ink-muted', hex: '#6E6A63', hexDark: '#A5A098' },
  { label: '淡灰', value: 'bg-ink-faint', hex: '#A5A098', hexDark: '#6E6A63' },
  { label: '暖黄', value: 'bg-warning', hex: '#C68D44', hexDark: '#C68D44' },
  { label: '暖红', value: 'bg-error', hex: '#B36651', hexDark: '#B36651' },
] as const
