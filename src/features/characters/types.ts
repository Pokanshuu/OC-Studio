import type { RelatedCharacter, GalleryImage, AvatarImage } from '@/types'

export interface CharacterFormData {
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
  bio: string
  lifeStory: string
  relatedCharacters: RelatedCharacter[]
  gallery: GalleryImage[]
  avatars: AvatarImage[]
}
