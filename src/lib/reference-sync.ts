import { db } from '@/lib/db'

type DocNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  [key: string]: unknown
}

interface RefInfo {
  id: string
  entityType: string
}

function collectRefs(node: DocNode): RefInfo[] {
  const refs: RefInfo[] = []

  function walk(n: DocNode) {
    if (!n || typeof n !== 'object') return

    if (n.type === 'mention' && n.attrs?.id) {
      refs.push({ id: String(n.attrs.id), entityType: String(n.attrs.entityType ?? '') })
    } else if (n.type === 'wikiLink' && n.attrs?.id) {
      refs.push({ id: String(n.attrs.id), entityType: 'world' })
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child)
    }
  }

  walk(node)
  return refs
}

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
        for (const c of chars) nameMap.set(String(c.id), c.name)
      })
    )
  }
  if (eventIds.length > 0) {
    queries.push(
      db.events.where('id').anyOf(eventIds).toArray().then(events => {
        for (const e of events) nameMap.set(String(e.id), e.title)
      })
    )
  }
  if (countryIds.length > 0) {
    queries.push(
      db.countries.where('id').anyOf(countryIds).toArray().then(countries => {
        for (const c of countries) nameMap.set(String(c.id), c.name)
      })
    )
  }
  if (worldIds.length > 0) {
    queries.push(
      db.worldEntries.where('id').anyOf(worldIds).toArray().then(entries => {
        for (const e of entries) nameMap.set(String(e.id), e.title)
      })
    )
  }

  await Promise.all(queries)
  return nameMap
}

function walkAndUpdate(node: DocNode, nameMap: Map<string, string>): DocNode {
  const isMention = node.type === 'mention'
  const isWikiLink = node.type === 'wikiLink'

  let updated = node

  if ((isMention || isWikiLink) && node.attrs?.id) {
    const currentName = nameMap.get(String(node.attrs.id))
    if (currentName && node.attrs.label !== currentName) {
      updated = { ...node, attrs: { ...node.attrs, label: currentName } }
    }
  }

  if (Array.isArray(node.content)) {
    let contentChanged = false
    const newContent = node.content.map(child => {
      const result = walkAndUpdate(child, nameMap)
      if (result !== child) contentChanged = true
      return result
    })
    if (contentChanged) {
      updated = { ...updated, content: newContent }
    }
  }

  return updated
}

export async function syncReferenceLabels(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!doc || typeof doc !== 'object') return doc

  const refs = collectRefs(doc as DocNode)
  if (refs.length === 0) return doc

  const nameMap = await lookupNames(refs)
  if (nameMap.size === 0) return doc

  const result = walkAndUpdate(doc as DocNode, nameMap)
  return result as Record<string, unknown>
}
