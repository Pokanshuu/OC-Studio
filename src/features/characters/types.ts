import type { RelatedCharacter, GalleryImage, AvatarImage } from '@/types'

export interface CharacterFormData {
  name: string
  aliases: string[]
  race: string
  element: string
  occupation: string
  faction: string
  nationalityLegacy: string
  countryId?: number
  height: string
  birthday: string
  avatarUrl: string
  headerUrl?: string
  bio: string
  lifeStory: string
  document?: unknown
  relatedCharacters: RelatedCharacter[]
  gallery: GalleryImage[]
  avatars: AvatarImage[]
  tags: number[]
  isMajor?: boolean
  /** 自定义字段的值（键 = 字段表里的 key）；内置字段走各自的列 */
  custom?: Record<string, string>
}
