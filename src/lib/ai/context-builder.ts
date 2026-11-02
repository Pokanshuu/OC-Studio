import { db } from '@/lib/db'

interface EntityContext {
  type: string
  name: string
  fields: Record<string, string>
}

export async function buildEntityContext(
  entityType: 'character' | 'event' | 'country' | 'worldEntry',
  entityId: number,
): Promise<string> {
  switch (entityType) {
    case 'character':
      return buildCharacterContext(entityId)
    case 'event':
      return buildEventContext(entityId)
    case 'country':
      return buildCountryContext(entityId)
    case 'worldEntry':
      return buildWorldEntryContext(entityId)
  }
}

async function buildCharacterContext(id: number): Promise<string> {
  const c = await db.characters.get(id)
  if (!c) return ''
  const parts: string[] = [`角色：${c.name}`]
  if (c.aliases.length) parts.push(`别名：${c.aliases.join('、')}`)
  if (c.race) parts.push(`种族：${c.race}`)
  if (c.element) parts.push(`元素：${c.element}`)
  if (c.occupation) parts.push(`职业：${c.occupation}`)
  if (c.nationalityLegacy) parts.push(`国籍：${c.nationalityLegacy}`)
  if (c.height) parts.push(`身高：${c.height}`)
  if (c.birthday) parts.push(`生日：${c.birthday}`)
  if (c.bio) parts.push(`简介：${c.bio}`)
  if (c.lifeStory) parts.push(`生平：${c.lifeStory}`)
  return parts.join('\n')
}

async function buildEventContext(id: number): Promise<string> {
  const e = await db.events.get(id)
  if (!e) return ''

  const relatedChars: string[] = []
  if (e.characters.length > 0) {
    const chars = await db.characters.bulkGet(e.characters)
    for (const c of chars) {
      if (c && !c.deleted) relatedChars.push(c.name)
    }
  }

  const parts: string[] = [`事件：${e.title}`]
  if (e.time) parts.push(`时间：${e.time}${e.endTime ? ` ~ ${e.endTime}` : ''}`)
  if (e.location) parts.push(`地点：${e.location}`)
  if (e.isMajor) parts.push('重大事件')
  if (relatedChars.length > 0) parts.push(`相关角色：${relatedChars.join('、')}`)
  if (e.summary) parts.push(`当前概括：${e.summary}`)
  parts.push(`\n详细内容：\n${e.content}`)
  return parts.join('\n')
}

async function buildCountryContext(id: number): Promise<string> {
  const c = await db.countries.get(id)
  if (!c) return ''
  const parts: string[] = [`国家/地区：${c.name}`]
  if (c.description) parts.push(`描述：${c.description}`)
  if (c.system) parts.push(`体制：${c.system}`)
  if (c.geography) parts.push(`地理：${c.geography}`)
  if (c.culture) parts.push(`文化：${c.culture}`)
  return parts.join('\n')
}

async function buildWorldEntryContext(id: number): Promise<string> {
  const w = await db.worldEntries.get(id)
  if (!w) return ''
  const parts: string[] = [`词条：${w.title}`]
  if (w.category) parts.push(`分类：${w.category}`)
  if (w.content) parts.push(`内容：${w.content}`)
  return parts.join('\n')
}

export async function buildProjectContext(): Promise<string> {
  const [characters, events, countries, worldEntries] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
  ])

  const parts: string[] = ['# 创作项目概要']
  parts.push(`\n## 角色 (${characters.length})`)
  characters.forEach((c) => {
    parts.push(`- ${c.name}${c.aliases.length ? `（${c.aliases.join('、')}）` : ''}${c.occupation ? ` — ${c.occupation}` : ''}`)
  })
  parts.push(`\n## 事件 (${events.length})`)
  events.forEach((e) => {
    parts.push(`- ${e.title}${e.time ? ` [${e.time}]` : ''}${e.isMajor ? ' ★' : ''}`)
  })
  parts.push(`\n## 国家/地区 (${countries.length})`)
  countries.forEach((c) => {
    parts.push(`- ${c.name}`)
  })
  parts.push(`\n## 词条 (${worldEntries.length})`)
  worldEntries.forEach((w) => {
    parts.push(`- ${w.title}`)
  })

  return parts.join('\n')
}
