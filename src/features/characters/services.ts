import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import type { Character } from '@/types'
import type { CharacterFormData } from './types'

const TABLE = 'characters'

function buildDefaultCharacter(
  data: CharacterFormData,
  overrides: Partial<Character> = {},
): Omit<Character, 'id'> {
  const now = Date.now()
  return {
    name: data.name,
    aliases: data.aliases,
    race: data.race,
    element: data.element,
    occupation: data.occupation,
    nationalityLegacy: data.nationalityLegacy,
    countryId: undefined,
    height: data.height,
    birthday: data.birthday,
    avatarUrl: data.avatarUrl,
    bio: data.bio,
    lifeStory: data.lifeStory,
    relationships: [],
    relatedCharacters: data.relatedCharacters,
    gallery: data.gallery,
    avatars: data.avatars,
    tags: data.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    _syncStatus: 'pending',
    _lastModified: now,
    ...overrides,
  }
}

export async function getCharacters(): Promise<Character[]> {
  const all = await db.characters.orderBy('name').toArray()
  return all.filter((c) => !c.deleted)
}

export async function getCharacter(id: number): Promise<Character | undefined> {
  return db.characters.get(id)
}

export async function createCharacter(data: CharacterFormData): Promise<number> {
  const character = buildDefaultCharacter(data)
  const id = await db.characters.add(character as Character)

  await logOperation(TABLE, id, 'name', '', data.name)

  return id
}

export async function updateCharacter(
  id: number,
  data: Partial<CharacterFormData>,
): Promise<void> {
  const existing = await db.characters.get(id)
  if (!existing) {
    throw new Error(`Character not found: ${id}`)
  }

  const now = Date.now()
  const updates: Partial<Character> = {
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  }

  type FieldKey = keyof CharacterFormData
  const fields: FieldKey[] = [
    'name',
    'aliases',
    'race',
    'element',
    'occupation',
    'nationalityLegacy',
    'height',
    'birthday',
    'avatarUrl',
    'qAvatarUrl',
    'headerUrl',
    'bio',
    'lifeStory',
  ]

  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field as keyof Character] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue))
    }
  }

  if (data.relatedCharacters !== undefined) {
    ;(updates as Record<string, unknown>).relatedCharacters = data.relatedCharacters
    await logOperation(
      TABLE,
      id,
      'relatedCharacters',
      JSON.stringify(existing.relatedCharacters),
      JSON.stringify(data.relatedCharacters),
    )
  }

  if (data.gallery !== undefined) {
    ;(updates as Record<string, unknown>).gallery = data.gallery
    await logOperation(
      TABLE,
      id,
      'gallery',
      JSON.stringify(existing.gallery),
      JSON.stringify(data.gallery),
    )
  }

  if (data.avatars !== undefined) {
    ;(updates as Record<string, unknown>).avatars = data.avatars
    await logOperation(
      TABLE,
      id,
      'avatars',
      JSON.stringify(existing.avatars),
      JSON.stringify(data.avatars),
    )
  }

  if (data.countryId !== undefined) {
    ;(updates as Record<string, unknown>).countryId = data.countryId
    await logOperation(
      TABLE,
      id,
      'countryId',
      String(existing.countryId ?? ''),
      String(data.countryId ?? ''),
    )
  }

  if (data.tags !== undefined) {
    ;(updates as Record<string, unknown>).tags = data.tags
    await logOperation(
      TABLE,
      id,
      'tags',
      JSON.stringify(existing.tags ?? []),
      JSON.stringify(data.tags),
    )
  }

  if (data.document !== undefined) {
    const synced = await syncReferenceLabels(data.document as Record<string, unknown>)
    ;(updates as Record<string, unknown>).document = synced
  }

  await db.characters.update(id, updates)

  if (data.name !== undefined) {
    updateReferencesAfterRename('character', id, data.name).catch(() => {})
  }
}

export async function saveDocument(id: number, document: unknown): Promise<void> {
  const now = Date.now()
  await db.characters.update(id, {
    document,
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  })
}

export async function deleteCharacter(id: number): Promise<void> {
  const now = Date.now()
  await db.characters.update(id, {
    deleted: true,
    _syncStatus: 'pending',
    _lastModified: now,
  })

  await logOperation(TABLE, id, 'deleted', 'false', 'true')
}
