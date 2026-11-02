import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import { syncRelationLabelFromEntity } from '@/features/relations/services'
import type { Character } from '@/types'
import type { CharacterFormData } from './types'
import { pickAccentColor } from '@/lib/entity-accent'

const TABLE = 'characters'

function buildDefaultCharacter(
  data: CharacterFormData,
  overrides: Partial<Character> = {},
): Omit<Character, 'id'> {
  const now = Date.now()
  return {
    name: data.name,
    entityKind: data.entityKind ?? 'character',
    accentColor: data.accentColor ?? pickAccentColor(),
    customFields: data.customFields ?? [],
    folderId: data.folderId ?? null,
    hiddenFields: data.hiddenFields ?? [],
    animationUrl: data.animationUrl ?? '',
    animationType: data.animationType ?? 'video',
    aliases: data.aliases,
    race: data.race,
    element: data.element,
    occupation: data.occupation,
    nationalityLegacy: data.nationalityLegacy,
    countryId: undefined,
    height: data.height,
    birthday: data.birthday,
    gender: data.gender ?? '',
    orientation: data.orientation ?? '',
    age: data.age ?? '',
    weight: data.weight ?? '',
    bloodType: data.bloodType ?? '',
    hairColor: data.hairColor ?? '',
    eyeColor: data.eyeColor ?? '',
    birthplace: data.birthplace ?? '',
    residence: data.residence ?? '',
    personality: data.personality ?? '',
    hobbies: data.hobbies ?? '',
    skills: data.skills ?? '',
    affiliation: data.affiliation ?? '',
    weapon: data.weapon ?? '',
    pet: data.pet ?? '',
    ability: data.ability ?? '',
    status: data.status ?? '',
    avatarUrl: data.avatarUrl,
    bio: data.bio,
    lifeStory: data.lifeStory,
    relationships: [],
    relatedCharacters: data.relatedCharacters,
    relatedNations: data.relatedNations ?? [],
    relatedNationLabels: data.relatedNationLabels ?? {},
    relatedEvents: data.relatedEvents ?? [],
    relatedEventLabels: data.relatedEventLabels ?? {},
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
    'entityKind',
    'accentColor',
    'customFields',
    'folderId',
    'hiddenFields',
    'animationUrl',
    'animationType',
    'aliases',
    'race',
    'element',
    'occupation',
    'nationalityLegacy',
    'height',
    'birthday',
    'gender',
    'orientation',
    'age',
    'weight',
    'bloodType',
    'hairColor',
    'eyeColor',
    'birthplace',
    'residence',
    'personality',
    'hobbies',
    'skills',
    'affiliation',
    'weapon',
    'pet',
    'ability',
    'status',
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

  if (data.relatedNations !== undefined) {
    ;(updates as Record<string, unknown>).relatedNations = data.relatedNations
    await logOperation(
      TABLE,
      id,
      'relatedNations',
      JSON.stringify(existing.relatedNations ?? []),
      JSON.stringify(data.relatedNations),
    )
  }

  if (data.relatedNationLabels !== undefined) {
    ;(updates as Record<string, unknown>).relatedNationLabels = data.relatedNationLabels
  }

  if (data.relatedEvents !== undefined) {
    ;(updates as Record<string, unknown>).relatedEvents = data.relatedEvents
    await logOperation(
      TABLE,
      id,
      'relatedEvents',
      JSON.stringify(existing.relatedEvents ?? []),
      JSON.stringify(data.relatedEvents),
    )
  }

  if (data.relatedEventLabels !== undefined) {
    ;(updates as Record<string, unknown>).relatedEventLabels = data.relatedEventLabels
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

  if (data.relatedCharacters !== undefined) {
    for (const related of data.relatedCharacters) {
      if (related.characterId !== undefined) {
        await syncRelationLabelFromEntity(
          'character',
          'character',
          id,
          'character',
          related.characterId,
          related.relation || '相关',
          related.relationId,
        )
      }
    }
  }
  if (data.relatedNationLabels !== undefined) {
    for (const [countryId, label] of Object.entries(data.relatedNationLabels)) {
      const numericId = Number(countryId)
      if (Number.isFinite(numericId)) {
        await syncRelationLabelFromEntity(
          'membership',
          'character',
          id,
          'country',
          numericId,
          label,
        )
      }
    }
  }
  if (data.relatedEventLabels !== undefined) {
    for (const [eventId, label] of Object.entries(data.relatedEventLabels)) {
      const numericId = Number(eventId)
      if (Number.isFinite(numericId)) {
        await syncRelationLabelFromEntity(
          'event-character',
          'event',
          numericId,
          'character',
          id,
          label,
        )
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }

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

  // 同步清理其他角色中指向它的关系投影，避免关系图删了人、面板里还留着。
  const others = await db.characters.filter((item) => !item.deleted && item.id !== id).toArray()
  await Promise.all(
    others.map((character) => {
      if (character.id === undefined) return Promise.resolve()
      const current = character.relatedCharacters ?? []
      const next = current.filter((item) => item.characterId !== id)
      if (next.length === current.length) return Promise.resolve()
      return db.characters.update(character.id, {
        relatedCharacters: next,
        updatedAt: now,
        _syncStatus: 'pending',
      })
    }),
  )

  // 国家/事件面板里也可能保留该角色的投影，一并清理。
  const [linkedCountries, linkedEvents] = await Promise.all([
    db.countries.filter((item) => !item.deleted && (item.characters ?? []).includes(id)).toArray(),
    db.events.filter((item) => !item.deleted && (item.characters ?? []).includes(id)).toArray(),
  ])
  await Promise.all([
    ...linkedCountries.map((country) =>
      country.id === undefined
        ? Promise.resolve()
        : db.countries.update(country.id, {
            characters: (country.characters ?? []).filter((item) => item !== id),
            updatedAt: now,
            _syncStatus: 'pending',
          }),
    ),
    ...linkedEvents.map((event) =>
      event.id === undefined
        ? Promise.resolve()
        : db.events.update(event.id, {
            characters: (event.characters ?? []).filter((item) => item !== id),
            updatedAt: now,
            _syncStatus: 'pending',
          }),
    ),
  ])

  await logOperation(TABLE, id, 'deleted', 'false', 'true')
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('data-updated'))
  }
}
