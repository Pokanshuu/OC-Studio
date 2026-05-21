export interface RelatedCharacter {
  characterId?: number
  name: string
  relation: string
}

export interface GalleryImage {
  url: string
  caption?: string
}

export interface AvatarImage {
  url: string
  type: 'portrait' | 'fullbody' | 'other'
}

export interface Character {
  id?: number
  name: string
  aliases: string[]
  race: string
  element: string
  occupation: string
  nationalityLegacy: string
  countryId?: number
  height: string
  birthday: string
  avatarUrl: string
  qAvatarUrl?: string
  headerUrl?: string
  bio: string
  lifeStory: string
  document?: unknown
  relationships: Relationship[]
  relatedCharacters: RelatedCharacter[]
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

export const PERIOD_COLORS = [
  { label: '暖灰', value: 'bg-paper-card', hex: '#F3EFE9', hexDark: '#2D2B28' },
  { label: '线灰', value: 'bg-line', hex: '#E7E3DC', hexDark: '#38352F' },
  { label: '深灰', value: 'bg-ink-muted', hex: '#6E6A63', hexDark: '#A5A098' },
  { label: '淡灰', value: 'bg-ink-faint', hex: '#A5A098', hexDark: '#6E6A63' },
  { label: '暖黄', value: 'bg-warning', hex: '#C68D44', hexDark: '#C68D44' },
  { label: '暖红', value: 'bg-error', hex: '#B36651', hexDark: '#B36651' },
] as const
