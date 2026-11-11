import { db } from '@/lib/db'
import type { Character, Event, Country, WorldEntry } from '@/types'
import {
  collectRefs,
  hasRef,
  refKey,
  retitleOneRef,
  retitleRefs,
  type DocNode,
  type RefInfo,
} from './reference-labels'

async function lookupNames(refs: RefInfo[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  const characterIds: number[] = []
  const eventIds: number[] = []
  const countryIds: number[] = []
  const worldIds: number[] = []

  for (const ref of refs) {
    const numId = parseInt(ref.id, 10)
    if (isNaN(numId)) continue
    switch (ref.entityType) {
      case 'character': characterIds.push(numId); break
      case 'event': eventIds.push(numId); break
      case 'country': countryIds.push(numId); break
      case 'world': worldIds.push(numId); break
    }
  }

  const queries: Promise<void>[] = []

  if (characterIds.length > 0) {
    queries.push(
      db.characters.where('id').anyOf(characterIds).toArray().then(chars => {
        for (const c of chars) nameMap.set(refKey('character', c.id), c.name)
      })
    )
  }
  if (eventIds.length > 0) {
    queries.push(
      db.events.where('id').anyOf(eventIds).toArray().then(events => {
        for (const e of events) nameMap.set(refKey('event', e.id), e.title)
      })
    )
  }
  if (countryIds.length > 0) {
    queries.push(
      db.countries.where('id').anyOf(countryIds).toArray().then(countries => {
        for (const c of countries) nameMap.set(refKey('country', c.id), c.name)
      })
    )
  }
  if (worldIds.length > 0) {
    queries.push(
      db.worldEntries.where('id').anyOf(worldIds).toArray().then(entries => {
        for (const e of entries) nameMap.set(refKey('world', e.id), e.title)
      })
    )
  }

  await Promise.all(queries)
  return nameMap
}

export async function syncReferenceLabels(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!doc || typeof doc !== 'object') return doc

  const refs = collectRefs(doc as DocNode)
  if (refs.length === 0) return doc

  const nameMap = await lookupNames(refs)
  if (nameMap.size === 0) return doc

  return retitleRefs(doc as DocNode, nameMap) as Record<string, unknown>
}

export async function updateReferencesAfterRename(
  entityType: string,
  entityId: number,
  newName: string,
): Promise<void> {
  const entityIdStr = String(entityId)
  const writes: Promise<void>[] = []

  const allChars = await db.characters.toArray()
  for (const c of allChars) {
    if (c.deleted || !c.id) continue
    // 角色「相关笔记」存的是笔记标题快照；笔记改名时不跟，重开库就解析不回 id 了
    if (
      entityType === 'world' &&
      (c.relatedNotes ?? []).some((relation) => relation.targetId === entityId)
    ) {
      const next = (c.relatedNotes ?? []).map((relation) =>
        relation.targetId === entityId ? { ...relation, name: newName } : relation,
      )
      writes.push(
        db.characters.update(c.id, { relatedNotes: next } as Partial<Character>).then(() => {}),
      )
    }
    if (!hasRef(c.document, entityType, entityIdStr)) continue
    const updated = retitleOneRef(c.document, entityType, entityId, newName)
    if (updated) {
      writes.push(db.characters.update(c.id, { document: updated } as Partial<Character>).then(() => {}))
    }
  }

  const allEvents = await db.events.toArray()
  for (const e of allEvents) {
    if (e.deleted || !e.id) continue
    if (!hasRef(e.document, entityType, entityIdStr)) continue
    const updated = retitleOneRef(e.document, entityType, entityId, newName)
    if (updated) {
      writes.push(db.events.update(e.id, { document: updated } as Partial<Event>).then(() => {}))
    }
  }

  const allCountries = await db.countries.toArray()
  for (const c of allCountries) {
    if (c.deleted || !c.id) continue
    if (!hasRef(c.document, entityType, entityIdStr)) continue
    const updated = retitleOneRef(c.document, entityType, entityId, newName)
    if (updated) {
      writes.push(db.countries.update(c.id, { document: updated } as Partial<Country>).then(() => {}))
    }
  }

  const allEntries = await db.worldEntries.toArray()
  for (const e of allEntries) {
    if (e.deleted || !e.id) continue
    // 笔记的命名关系存的是目标名字快照；目标改名时不跟，重开库就解析不回 id 了
    if (
      entityType === 'world' &&
      (e.relations ?? []).some((relation) => relation.targetId === entityId)
    ) {
      const next = (e.relations ?? []).map((relation) =>
        relation.targetId === entityId ? { ...relation, name: newName } : relation,
      )
      writes.push(
        db.worldEntries.update(e.id, { relations: next } as Partial<WorldEntry>).then(() => {}),
      )
    }
    if (hasRef(e.document, entityType, entityIdStr)) {
      const updated = retitleOneRef(e.document, entityType, entityId, newName)
      if (updated) {
        writes.push(db.worldEntries.update(e.id, { document: updated } as Partial<WorldEntry>).then(() => {}))
      }
    }
    // World entries store TipTap JSON in the content field as a string
    if (e.content && typeof e.content === 'string') {
      try {
        const parsed = JSON.parse(e.content) as unknown
        if (hasRef(parsed, entityType, entityIdStr)) {
          const updated = retitleOneRef(parsed, entityType, entityId, newName)
          if (updated) {
            writes.push(db.worldEntries.update(e.id, { content: JSON.stringify(updated) } as Partial<WorldEntry>).then(() => {}))
          }
        }
      } catch {
        // content is plain text, not JSON
      }
    }
  }

  if (writes.length > 0) await Promise.all(writes)
}
