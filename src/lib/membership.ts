import { db } from './db'
import { logOperation, pendingStamp } from './sync'
import type { Character } from '@/types'

/**
 * 成员关系的**单向应用**（阶段二·一之后）。
 *
 * 历史：以前角色 ⇄ 国家、事件 ⇄ 国家是**两份列表互相镜像** —— 国家的 frontmatter 里
 * 另存一份 `characters` / `events` id 数组，两边都要写，只写一侧就会出现
 * 「拖完只在国家里看到、角色国籍仍为空」。这套镜像已经拆掉了。
 *
 * 现在**只有实体侧是数据**：
 * - 角色的国籍 = `character.countryId`（单值）
 * - 事件的相关国家 = `event.countries`（id 数组）
 *
 * 国家页的「相关角色 / 相关事件」是**查询结果**（`features/countries/services.ts` 的
 * `listCountryCharacters` / `listCountryEvents`），不是存储。在国家里增删一条，
 * 就是改上面那两个字段 —— 所以这里只剩三件事：
 *
 * 1. `applyCountryCharacters` / `applyCountryEvents`：国家编辑器的名单 → 写实体侧
 * 2. `purgeCharacterReferences` / `purgeCountryReferences`：软删除后清掉**指向它的引用**
 * 3. 盘上遗留的 `country.characters` / `country.events`：**不读、不写、不删**
 *    （`scan` 读进来只为保真回写，没有任何界面路径依赖它）
 */

/**
 * 国家编辑器改了「相关角色」：写回角色的国籍。
 * - 新加的人：只在**没有国籍**时补上（名单是松散的，不抢别人已经填好的国籍）
 * - 去掉的人：国籍正是本国的才清空 —— 否则关系图上那条「属于」的边还会留着，看着像删不掉
 *
 * `null` 是「没有国籍」的落库形态（角色表单清空国籍时写的也是 null）。
 */
export async function applyCountryCharacters(
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

/** 国家编辑器改了「相关事件」：写回事件的相关国家（事件侧是 id 数组，直接增删） */
export async function applyCountryEvents(
  countryId: number,
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
   软删除只改自己那一行；别处的**投影**（关系表 / 事件参与者）不会自动消失，
   于是删完角色后，别人的关系表、事件参与者里还挂着一个看不见的人。
   这里按「被删的是谁」把指向它的那一项摘掉；只改投影，不动被删的行。
   **不碰 `updatedAt`**：清理不是编辑，不该让整库窜到「最近更新」最前面。 */

/** 删角色：清掉别人关系表里的它、事件参与者里的它 */
export async function purgeCharacterReferences(characterId: number, now: number): Promise<void> {
  for (const row of await db.characters.toArray()) {
    const list = row.relatedCharacters ?? []
    const next = list.filter((item) => item.characterId !== characterId)
    if (next.length === list.length) continue
    await db.characters.update(row.id, { relatedCharacters: next, ...pendingStamp(now) })
    await logOperation('characters', row.id, 'relatedCharacters', JSON.stringify(list), JSON.stringify(next))
  }
  for (const row of await db.events.toArray()) {
    const list = row.characters ?? []
    const next = list.filter((id) => id !== characterId)
    if (next.length === list.length) continue
    await db.events.update(row.id, { characters: next, ...pendingStamp(now) })
    await logOperation('events', row.id, 'characters', JSON.stringify(list), JSON.stringify(next))
  }
}

/** 删国家：清掉角色的国籍、事件的相关国家（国家侧自己没有名单要清） */
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
