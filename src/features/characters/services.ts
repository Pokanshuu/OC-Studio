import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import { purgeCharacterReferences } from '@/lib/membership'
import type { Character } from '@/types'
import type { CharacterFormData } from './types'
import { bodyPresetDoc } from '@/lib/templates/body-preset'

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
    faction: data.faction,
    nationalityLegacy: data.nationalityLegacy,
    countryId: data.countryId,
    height: data.height,
    birthday: data.birthday,
    avatarUrl: data.avatarUrl,
    bio: data.bio,
    lifeStory: data.lifeStory,
    relatedCharacters: data.relatedCharacters,
    relatedNotes: data.relatedNotes ?? [],
    gallery: data.gallery,
    avatars: data.avatars,
    tags: data.tags ?? [],
    isMajor: data.isMajor ?? false,
    custom: data.custom ?? {},
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getCharacters(): Promise<Character[]> {
  return listActive(db.characters, 'name')
}

export async function getCharacter(id: number): Promise<Character | undefined> {
  return getById(db.characters, id)
}

export async function createCharacter(data: CharacterFormData): Promise<number> {
  // 模板里设了「正文预设」就铺进去（只在正文还空着的新条目上；模板没设 = 什么都没变）
  const draft = buildDefaultCharacter(data)
  const preset = draft.document == null ? await bodyPresetDoc('character') : null
  const character = preset === null ? draft : { ...draft, document: preset }
  const id = await db.characters.add(character)

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
    ...pendingStamp(now),
  }

  type FieldKey = keyof CharacterFormData
  const fields: FieldKey[] = [
    'name',
    'aliases',
    'race',
    'element',
    'occupation',
    'faction',
    'nationalityLegacy',
    'height',
    'birthday',
    'avatarUrl',
    'headerUrl',
    'animationUrl',
    'bio',
    'lifeStory',
    'isMajor',
  ]

  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field as keyof Character] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue))
    }
  }

  if (data.custom !== undefined) {
    ;(updates as Record<string, unknown>).custom = data.custom
    await logOperation(
      TABLE,
      id,
      'custom',
      JSON.stringify(existing.custom ?? {}),
      JSON.stringify(data.custom),
    )
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

  if (data.relatedNotes !== undefined) {
    ;(updates as Record<string, unknown>).relatedNotes = data.relatedNotes
    await logOperation(
      TABLE,
      id,
      'relatedNotes',
      JSON.stringify(existing.relatedNotes ?? []),
      JSON.stringify(data.relatedNotes),
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

  // 国籍是**唯一真源**（阶段二·一）：国家页的「相关角色」是查询出来的，没有镜像要补

  if (data.name !== undefined) {
    updateReferencesAfterRename('character', id, data.name).catch(() => {})
  }
}

export async function deleteCharacter(id: number): Promise<void> {
  await softDelete(db.characters, id, TABLE)
  await purgeCharacterReferences(id, Date.now())
}

/**
 * 表格里的「所属国家」下拉：`null` = 清空国籍。
 *
 * 不能走 `updateCharacter({ countryId: undefined })` —— `undefined` 在那里表示
 * 「这个字段没改」，于是「选回未归属」永远不会落库。落库形态与 `lib/membership.ts`
 * 一致：没有国籍就是 `null`（角色表单清空国籍时写的也是它）。
 */
export async function assignCharacterCountry(id: number, countryId: number | null): Promise<void> {
  const existing = await db.characters.get(id)
  if (!existing) throw new Error(`Character not found: ${id}`)
  if ((existing.countryId ?? null) === countryId) return
  const now = Date.now()
  await db.characters.update(id, {
    countryId,
    updatedAt: now,
    ...pendingStamp(now),
  } as unknown as Partial<Character>)
  await logOperation(TABLE, id, 'countryId', String(existing.countryId ?? ''), String(countryId ?? ''))
}

/**
 * 手动排序：把 `character` 的顺序写成 0..n-1。
 * 只写真的变了的行；**不碰 updatedAt**（排序不是编辑，别让它窜到「按编辑时间」前面）。
 */
export async function reorderCharacters(ids: number[]): Promise<void> {
  const rows = await db.characters.bulkGet(ids)
  const changes: { id: number; order: number }[] = []
  ids.forEach((id, index) => {
    const row = rows[index]
    if (row && row.order !== index) changes.push({ id, order: index })
  })
  if (changes.length === 0) return
  const now = Date.now()
  await db.transaction('rw', db.characters, async () => {
    for (const change of changes) {
      await db.characters.update(change.id, { order: change.order, ...pendingStamp(now) })
    }
  })
}
