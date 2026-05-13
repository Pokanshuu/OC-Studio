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
  deleted: number
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
