import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import { purgeCountryReferences, applyCountryCharacters, applyCountryEvents } from '@/lib/membership'
import type { Character, Country, Event } from '@/types'
import type { CountryFormData } from './types'
import { bodyPresetDoc } from '@/lib/templates/body-preset'

const TABLE = 'countries'

/**
 * 国家页的「相关角色」= **查询结果**（阶段二·一）。
 *
 * 数据只有一份：角色的 `countryId`。`country.characters` 是历史遗留的两份列表里的
 * 另一份，已经不读不写不删了（旧文件里还有，但没有任何界面路径依赖它）。
 */
export async function listCountryCharacters(countryId: number): Promise<Character[]> {
  const rows = await db.characters
    .filter((row) => !row.deleted && row.countryId === countryId)
    .toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

/** 国家页的「相关事件」= 查询结果（`event.countries` 里包含它） */
export async function listCountryEvents(countryId: number): Promise<Event[]> {
  const rows = await db.events
    .filter((row) => !row.deleted && (row.countries ?? []).includes(countryId))
    .toArray()
  return rows.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '', 'zh'))
}

function buildDefaultCountry(data: CountryFormData, overrides: Partial<Country> = {}): Omit<Country, 'id'> {
  const now = Date.now()
  return {
    name: data.name,
    parentId: data.parentId,
    description: data.description,
    system: data.system,
    geography: data.geography,
    culture: data.culture,
    gallery: data.gallery,
    tags: data.tags ?? [],
    custom: data.custom ?? {},
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getCountries(): Promise<Country[]> {
  return listActive(db.countries, 'name')
}

export async function getCountry(id: number): Promise<Country | undefined> {
  return getById(db.countries, id)
}

export async function createCountry(data: CountryFormData): Promise<number> {
  // 模板的正文预设（见 `lib/templates/body-preset.ts`）：只在空正文的新条目上铺
  const draft = buildDefaultCountry(data)
  const preset = draft.document == null ? await bodyPresetDoc('country') : null
  const country = preset === null ? draft : { ...draft, document: preset }
  const id = await db.countries.add(country)

  await logOperation(TABLE, id, 'name', '', data.name)
  if (data.description) {
    await logOperation(TABLE, id, 'description', '', data.description)
  }

  return id
}

export async function updateCountry(id: number, data: Partial<CountryFormData>): Promise<void> {
  const existing = await db.countries.get(id)
  if (!existing) {
    throw new Error(`Country not found: ${id}`)
  }

  const now = Date.now()
  const updates: Partial<Country> = {
    updatedAt: now,
    ...pendingStamp(now),
  }

  type FieldKey = Extract<keyof CountryFormData, keyof Country>
  const fields: FieldKey[] = ['name', 'parentId', 'description', 'system', 'geography', 'culture', 'flagUrl', 'headerUrl']

  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue ?? ''))
    }
  }

  if (data.tags !== undefined) {
    ;(updates as Record<string, unknown>).tags = data.tags
    await logOperation(TABLE, id, 'tags', JSON.stringify(existing.tags ?? []), JSON.stringify(data.tags))
  }

  // 图集是对象数组：日志走 JSON，`String()` 会变成一串 [object Object]
  if (data.gallery !== undefined) {
    ;(updates as Record<string, unknown>).gallery = data.gallery
    await logOperation(
      TABLE,
      id,
      'gallery',
      JSON.stringify(existing.gallery ?? []),
      JSON.stringify(data.gallery),
    )
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

  if (data.document !== undefined) {
    const synced = await syncReferenceLabels(data.document as Record<string, unknown>)
    ;(updates as Record<string, unknown>).document = synced
  }

  await db.countries.update(id, updates)

  // 「相关角色 / 相关事件」不是这个行的列，是**实体侧的字段**（阶段二·一）：
  // 国家编辑器的名单 → 写角色的国籍 / 事件的相关国家。不再有任何镜像要补。
  if (data.characters !== undefined) {
    const current = (await listCountryCharacters(id)).map((row) => row.id)
    await applyCountryCharacters(id, current, data.characters, now)
  }
  if (data.events !== undefined) {
    const current = (await listCountryEvents(id)).map((row) => row.id)
    await applyCountryEvents(id, current, data.events, now)
  }

  if (data.name !== undefined) {
    updateReferencesAfterRename('country', id, data.name).catch(() => {})
  }
}

export async function deleteCountry(id: number): Promise<void> {
  await softDelete(db.countries, id, TABLE)
  await purgeCountryReferences(id, Date.now())
}

/**
 * 手动排序：把 `country` 的顺序写成 0..n-1。
 * 只写真的变了的行；**不碰 updatedAt**（排序不是编辑，别让它窜到「按编辑时间」前面）。
 */
export async function reorderCountries(ids: number[]): Promise<void> {
  const rows = await db.countries.bulkGet(ids)
  const changes: { id: number; order: number }[] = []
  ids.forEach((id, index) => {
    const row = rows[index]
    if (row && row.order !== index) changes.push({ id, order: index })
  })
  if (changes.length === 0) return
  const now = Date.now()
  await db.transaction('rw', db.countries, async () => {
    for (const change of changes) {
      await db.countries.update(change.id, { order: change.order, ...pendingStamp(now) })
    }
  })
}
