import { db } from './db'
import { logOperation, pendingStamp } from './sync'
import type { Character } from '@/types'

/**
 * 成员关系的**镜像写入**（唯一实现）。
 *
 * 数据模型里这两对是两份列表：
 * - 角色侧 `countryId`（国籍）⇄ 国家侧 `characters`（相关角色）
 * - 事件侧 `countries`（相关国家）⇄ 国家侧 `events`（相关事件）
 *
 * 实体侧是权威，国家侧是镜像。改权威字段时顺手把镜像补齐，否则另一侧编辑器里
 * 看不到这条关系（「拖完只在国家里出现、角色国籍仍为空」就是这么来的）。
 *
 * 只做增删、幂等；国家已不存在时静默跳过（它可能已被软删除）。
 * 关系图拖拽（`features/relations/services.ts`）与角色 / 国家 / 事件三个编辑器的保存共用这里，
 * 保证「无论从哪条路建立关系，两边都对得上」。
 */

export async function addCountryCharacter(countryId: number, characterId: number, now: number): Promise<void> {
  const country = await db.countries.get(countryId)
  if (!country) return
  const list = country.characters ?? []
  if (list.includes(characterId)) return
  const next = [...list, characterId]
  await db.countries.update(country.id, { characters: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('countries', country.id, 'characters', JSON.stringify(list), JSON.stringify(next))
}

export async function removeCountryCharacter(countryId: number, characterId: number, now: number): Promise<void> {
  const country = await db.countries.get(countryId)
  if (!country) return
  const list = country.characters ?? []
  if (!list.includes(characterId)) return
  const next = list.filter((id) => id !== characterId)
  await db.countries.update(country.id, { characters: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('countries', country.id, 'characters', JSON.stringify(list), JSON.stringify(next))
}

export async function addCountryEvent(countryId: number, eventId: number, now: number): Promise<void> {
  const country = await db.countries.get(countryId)
  if (!country) return
  const list = country.events ?? []
  if (list.includes(eventId)) return
  const next = [...list, eventId]
  await db.countries.update(country.id, { events: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('countries', country.id, 'events', JSON.stringify(list), JSON.stringify(next))
}

export async function removeCountryEvent(countryId: number, eventId: number, now: number): Promise<void> {
  const country = await db.countries.get(countryId)
  if (!country) return
  const list = country.events ?? []
  if (!list.includes(eventId)) return
  const next = list.filter((id) => id !== eventId)
  await db.countries.update(country.id, { events: next, updatedAt: now, ...pendingStamp(now) })
  await logOperation('countries', country.id, 'events', JSON.stringify(list), JSON.stringify(next))
}

/** 角色换国籍：新国家补进名单、旧国家摘掉（国籍是单值，旧的那条已经不算数了） */
export async function syncCharacterCountry(
  characterId: number,
  previousCountryId: number | null,
  nextCountryId: number | null,
  now: number,
): Promise<void> {
  if (previousCountryId === nextCountryId) return
  if (previousCountryId !== null) await removeCountryCharacter(previousCountryId, characterId, now)
  if (nextCountryId !== null) await addCountryCharacter(nextCountryId, characterId, now)
}

/** 事件的相关国家变了：按差集补/摘国家侧的「相关事件」 */
export async function syncEventCountries(
  eventId: number,
  previousCountryIds: number[],
  nextCountryIds: number[],
  now: number,
): Promise<void> {
  const previous = new Set(previousCountryIds)
  const next = new Set(nextCountryIds)
  for (const countryId of previous) {
    if (!next.has(countryId)) await removeCountryEvent(countryId, eventId, now)
  }
  for (const countryId of next) {
    if (!previous.has(countryId)) await addCountryEvent(countryId, eventId, now)
  }
}

/**
 * 国家编辑器改了「相关角色」：镜像回角色的国籍。
 * - 新加的人：只在**没有国籍**时补上（相关角色是松散名单，不抢别人已经填好的国籍）
 * - 去掉的人：国籍正是本国的才清空 —— 否则关系图上那条「属于」的边还会留着，看着像删不掉
 *
 * `null` 是「没有国籍」的落库形态（角色表单清空国籍时写的也是 null）。
 */
export async function syncCountryCharacters(
  countryId: number,
  previousCharacterIds: number[],
  nextCharacterIds: number[],
  now: number,
): Promise<void> {
  const previous = new Set(previousCharacterIds)
  const next = new Set(nextCharacterIds)

  for (const characterId of previous) {
    if (next.has(characterId)) continue
    const character = await db.characters.get(characterId)
    if (!character || character.countryId !== countryId) continue
    await db.characters.update(character.id, {
      countryId: null,
      updatedAt: now,
      ...pendingStamp(now),
    } as unknown as Partial<Character>)
    await logOperation('characters', character.id, 'countryId', String(countryId), '')
  }

  for (const characterId of next) {
    if (previous.has(characterId)) continue
    const character = await db.characters.get(characterId)
    if (!character || character.countryId != null) continue
    await db.characters.update(character.id, {
      countryId,
      updatedAt: now,
      ...pendingStamp(now),
    })
    await logOperation('characters', character.id, 'countryId', '', String(countryId))
  }
}

/** 国家编辑器改了「相关事件」：镜像回事件的相关国家（事件侧没有单值字段，直接增删） */
export async function syncCountryEvents(  countryId: number,
  previousEventIds: number[],
  nextEventIds: number[],
  now: number,
): Promise<void> {
  const previous = new Set(previousEventIds)
  const next = new Set(nextEventIds)

  for (const eventId of previous) {
    if (next.has(eventId)) continue
    const event = await db.events.get(eventId)
    if (!event) continue
    const list = event.countries ?? []
    if (!list.includes(countryId)) continue
    const updated = list.filter((id) => id !== countryId)
    await db.events.update(event.id, { countries: updated, updatedAt: now, ...pendingStamp(now) })
    await logOperation('events', event.id, 'countries', JSON.stringify(list), JSON.stringify(updated))
  }

  for (const eventId of next) {
    if (previous.has(eventId)) continue
    const event = await db.events.get(eventId)
    if (!event) continue
    const list = event.countries ?? []
    if (list.includes(countryId)) continue
    const updated = [...list, countryId]
    await db.events.update(event.id, { countries: updated, updatedAt: now, ...pendingStamp(now) })
    await logOperation('events', event.id, 'countries', JSON.stringify(list), JSON.stringify(updated))
  }
}

/* ── 软删除后的投影清理 ─────────────────────────────────────
   软删除只改自己那一行；别处的**投影**（关系表 / 国家名单 / 事件参与者）不会自动消失，
   于是删完角色后，别人的关系表国家名单里还挂着一个看不见的人（PR #5 的 #10）。
   这里按「被删的是谁」把指向它的那一项摘掉；只改投影，不动被删的行。
   **不碰 `updatedAt`**：清理不是编辑，不该让整库窜到「最近更新」最前面。 */

/** 删角色：清掉别人关系表里的它、国家名单里的它、事件参与者里的它 */
export async function purgeCharacterReferences(characterId: number, now: number): Promise<void> {
  for (const row of await db.characters.toArray()) {
    const list = row.relatedCharacters ?? []
    const next = list.filter((item) => item.characterId !== characterId)
    if (next.length === list.length) continue
    await db.characters.update(row.id, { relatedCharacters: next, ...pendingStamp(now) })
    await logOperation('characters', row.id, 'relatedCharacters', JSON.stringify(list), JSON.stringify(next))
  }
  for (const row of await db.countries.toArray()) {
    const list = row.characters ?? []
    const next = list.filter((id) => id !== characterId)
    if (next.length === list.length) continue
    await db.countries.update(row.id, { characters: next, ...pendingStamp(now) })
    await logOperation('countries', row.id, 'characters', JSON.stringify(list), JSON.stringify(next))
  }
  for (const row of await db.events.toArray()) {
    const list = row.characters ?? []
    const next = list.filter((id) => id !== characterId)
    if (next.length === list.length) continue
    await db.events.update(row.id, { characters: next, ...pendingStamp(now) })
    await logOperation('events', row.id, 'characters', JSON.stringify(list), JSON.stringify(next))
  }
}

/** 删国家：清掉角色的国籍、事件的相关国家 */
export async function purgeCountryReferences(countryId: number, now: number): Promise<void> {
  for (const row of await db.characters.toArray()) {
    if (row.countryId !== countryId) continue
    await db.characters.update(row.id, {
      countryId: null,
      ...pendingStamp(now),
    } as unknown as Partial<Character>)
    await logOperation('characters', row.id, 'countryId', String(countryId), '')
  }
  for (const row of await db.events.toArray()) {
    const list = row.countries ?? []
    const next = list.filter((id) => id !== countryId)
    if (next.length === list.length) continue
    await db.events.update(row.id, { countries: next, ...pendingStamp(now) })
    await logOperation('events', row.id, 'countries', JSON.stringify(list), JSON.stringify(next))
  }
}

/** 删事件：清掉国家侧的「相关事件」 */
export async function purgeEventReferences(eventId: number, now: number): Promise<void> {
  for (const row of await db.countries.toArray()) {
    const list = row.events ?? []
    const next = list.filter((id) => id !== eventId)
    if (next.length === list.length) continue
    await db.countries.update(row.id, { events: next, ...pendingStamp(now) })
    await logOperation('countries', row.id, 'events', JSON.stringify(list), JSON.stringify(next))
  }
}
