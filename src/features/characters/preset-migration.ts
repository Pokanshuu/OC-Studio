import { db } from '@/lib/db'
import { pickAccentColor } from '@/lib/entity-accent'
import { clearPresetEntries, ensurePresetSections, listPresetEntries } from '@/features/custom-sections'
import type { Character, CharacterKind } from '@/types'

/**
 * 0.18.2 起武器/宠物使用角色模板实体。
 * 旧版存在自定义分类里的武器/宠物条目会一次性迁移到 characters 表，避免数据丢失。
 */
export async function migratePresetEntriesToCharacters(): Promise<void> {
  if (typeof window === 'undefined') return
  // 先把旧版按名称创建的“武器/宠物”分类标记为预设，确保从自定义分类列表中隐藏。
  ensurePresetSections()
  const entries = listPresetEntries()
  if (entries.length === 0) return
  const allCharacters = await db.characters.toArray()
  const characterById = new Map(allCharacters.map((item) => [item.id, item]))
  let migrated = 0
  try {
    for (const entry of entries) {
      const kind: CharacterKind = entry.preset
      const exists = await db.characters
        .filter(
          (character) =>
            !character.deleted &&
            (character.entityKind ?? 'character') === kind &&
            character.name === entry.name,
        )
        .first()
      if (exists) continue
      const now = Date.now()
      const character: Omit<Character, 'id'> = {
        name: entry.name || (kind === 'weapon' ? '未命名武器' : '未命名宠物'),
        entityKind: kind,
        accentColor: pickAccentColor(entry.name),
        customFields: [],
        folderId: null,
        hiddenFields: [],
        animationUrl: '',
        animationType: 'video',
        aliases: [],
        race: '',
        element: '',
        occupation: '',
        nationalityLegacy: '',
        height: '',
        birthday: '',
        gender: '',
        orientation: '',
        age: '',
        weight: '',
        bloodType: '',
        hairColor: '',
        eyeColor: '',
        birthplace: '',
        residence: '',
        personality: '',
        hobbies: '',
        skills: '',
        affiliation: '',
        weapon: '',
        pet: '',
        ability: '',
        status: '',
        avatarUrl: entry.avatarUrl,
        headerUrl: entry.headerUrl,
        bio: entry.note,
        lifeStory: '',
        relationships: [],
        relatedCharacters: entry.characterIds
          .map((id) => characterById.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((item) => ({
            characterId: item.id,
            name: item.name,
            relation: '相关',
          })),
        relatedNations: [],
        relatedNationLabels: {},
        relatedEvents: [],
        relatedEventLabels: {},
        gallery: entry.gallery.map((url) => ({ url, caption: '' })),
        avatars: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: now,
      }
      await db.characters.add(character)
      migrated += 1
    }
    clearPresetEntries()
    if (migrated > 0) {
      window.dispatchEvent(new Event('data-updated'))
    }
  } catch (error) {
    console.error('[preset-migration] failed', error)
  }
}
