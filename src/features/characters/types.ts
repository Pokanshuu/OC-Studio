import type { CharacterCustomField, RelatedCharacter, GalleryImage, AvatarImage, CharacterKind } from '@/types'

export interface CharacterFormData {
  name: string
  entityKind?: CharacterKind
  accentColor?: string
  customFields?: CharacterCustomField[]
  folderId?: string | null
  hiddenFields?: string[]
  animationUrl?: string
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
  relatedCharacters: RelatedCharacter[]
  relatedNations?: number[]
  relatedNationLabels?: Record<number, string>
  relatedEvents?: number[]
  relatedEventLabels?: Record<number, string>
  gallery: GalleryImage[]
  avatars: AvatarImage[]
  tags: number[]
}
