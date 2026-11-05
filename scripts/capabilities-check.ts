/**
 * 只读能力层自检：`npx tsx scripts/capabilities-check.ts`
 *
 * 用一份内存 store 验权限入口、列表 / 读取 / 搜索 / 关系切片与图鉴切片装配。
 * 不碰 Dexie / 文件系统。
 */
import { createCapabilities, buildCodexSlice } from '../src/lib/capabilities'
import type { Caller, CapabilityStore } from '../src/lib/capabilities/types'
import type { Character, Country, Event, Tag, WorldEntry } from '../src/types'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

function character(input: Partial<Character> & Pick<Character, 'id' | 'name'>): Character {
  return {
    aliases: [], race: '', element: '', occupation: '', faction: '', nationalityLegacy: '',
    height: '', birthday: '', avatarUrl: '', bio: '', lifeStory: '', relatedCharacters: [],
    gallery: [], avatars: [], tags: [], createdAt: 0, updatedAt: 0, deleted: false,
    _syncStatus: 'synced', _lastModified: 0, ...input,
  }
}

function event(input: Partial<Event> & Pick<Event, 'id' | 'title'>): Event {
  return {
    aliases: [], time: '', endTime: '', location: '', summary: '', content: '',
    characters: [], countries: [], relations: [], images: [], tags: [], isMajor: false,
    createdAt: 0, updatedAt: 0, deleted: false, _syncStatus: 'synced', _lastModified: 0,
    ...input, parentEventId: input.parentEventId ?? null,
  }
}

function country(input: Partial<Country> & Pick<Country, 'id' | 'name'>): Country {
  return {
    aliases: [], description: '', system: '', geography: '', culture: '', flagUrl: '',
    characters: [], events: [], tags: [], createdAt: 0, updatedAt: 0, deleted: false,
    _syncStatus: 'synced', _lastModified: 0, ...input, parentId: input.parentId ?? null,
  }
}

function world(input: Partial<WorldEntry> & Pick<WorldEntry, 'id' | 'title'>): WorldEntry {
  return {
    aliases: [], content: '', parentId: null, order: 0, isConcept: false, references: [],
    tags: [], createdAt: 0, updatedAt: 0, deleted: false, _syncStatus: 'synced',
    _lastModified: 0, ...input, category: input.category ?? '',
  }
}

const tag: Tag = { id: 1, name: '主角', category: '', color: '赤陶' }
const characters = [
  character({
    id: 1,
    name: '弗利欧',
    race: '星语者',
    occupation: '绘星师',
    countryId: 1,
    bio: '在星图上旅行的人。',
    tags: [1],
    relatedCharacters: [{ characterId: 2, name: '阿岩', relation: '同伴' }],
  }),
  character({ id: 2, name: '阿岩' }),
]
const events = [
  event({ id: 1, title: '诞生', time: '1203', characters: [1], countries: [1] }),
  event({ id: 2, title: '初遇', time: '1210', characters: [1] }),
]
const countries = [country({ id: 1, name: '瓦兰', system: '城邦' })]
const worlds = [world({ id: 1, title: '星语者', content: '以星图为语言的人。' })]
const tags = [tag]

const store: CapabilityStore = {
  async list(kind) {
    if (kind === 'character') return characters as never
    if (kind === 'event') return events as never
    if (kind === 'country') return countries as never
    return worlds as never
  },
  async get(kind, id) {
    const pool =
      kind === 'character' ? characters : kind === 'event' ? events : kind === 'country' ? countries : worlds
    return (pool.find((row) => row.id === id) ?? null) as never
  },
  async tags() {
    return tags
  },
}

const api = createCapabilities(store)
const reader: Caller = { actor: 'agent:test', permissions: 0 }

async function main(): Promise<void> {
  const list = await api.listEntities(reader, 'character')
  check('列角色', list.length === 2 && list[0]?.title === '弗利欧')
  check('列表带标签名', list[0]?.tags.includes('主角') === true)

  const entry = await api.getEntity(reader, 'character', 1)
  check('读取字段', entry.fields.some((field) => field.key === '种族' && field.value === '星语者'))
  check('读取关系', entry.relations.some((relation) => relation.name === '阿岩' && relation.relation === '同伴'))
  check('读取相关事件', entry.events.map((item) => item.title).join(',') === '诞生,初遇')
  check('读取标签', entry.tags.includes('主角'))
  check('读取正文', entry.body.includes('在星图上旅行的人'))

  const slice = buildCodexSlice(entry)
  check('切片标题', slice.startsWith('# 弗利欧（角色）'))
  check('切片字段', slice.includes('种族 星语者'))
  check('切片关系', slice.includes('阿岩（同伴）'))
  check('切片事件', slice.includes('1203 诞生 → 1210 初遇'))
  check('切片正文', slice.includes('正文：') && slice.includes('在星图上旅行的人'))

  const found = await api.search(reader, '阿岩')
  check('搜索按名字', found.some((row) => row.id === 2))
  const byTag = await api.search(reader, '主角')
  check('搜索按标签', byTag.some((row) => row.id === 1))

  const graph = await api.graphSlice(reader, 'character', 1, 1)
  check('关系切片含本人与同伴', graph.some((row) => row.id === 1) && graph.some((row) => row.id === 2))
  check('关系切片含相关事件', graph.some((row) => row.kind === 'event' && row.title === '诞生'))

  let denied = false
  try {
    await api.listEntities({ actor: 'human', permissions: -1 as 0 }, 'character')
  } catch {
    denied = true
  }
  check('权限不足被拒', denied)

  let invalid = false
  try {
    await api.getEntity({ actor: 'root' as 'human', permissions: 0 }, 'character', 1)
  } catch {
    invalid = true
  }
  check('非法 actor 被拒', invalid)

  let missing = false
  try {
    await api.getEntity(reader, 'character', 999)
  } catch {
    missing = true
  }
  check('不存在的实体报错', missing)

  if (failuresNow() === 0) console.log(`\n能力层自检通过：${passed} 项断言`)
}

function failuresNow(): number {
  return process.exitCode === 1 ? 1 : 0
}

void main()
