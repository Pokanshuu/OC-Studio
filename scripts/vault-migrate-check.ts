/**
 * 老数据迁移（lib/vault/export-dir）的自检。
 *
 * 用法：
 *   npx tsx scripts/vault-migrate-check.ts
 *
 * 验的核心性质是**闭环**：Dexie 里的实体 → 全量物化出来的 .md → 扫描层读回来，
 * 关键字段必须一模一样。迁移只有一次机会（迁完 Dexie 就被文件夹覆盖了），
 * 所以「生成的笔记能不能被自己读懂」必须先用断言证明，而不是迁完再看。
 *
 * 这里不碰磁盘：文件内容在内存里拼出来后直接喂给 scanVault。
 * 真正写盘（含图片、tags.json、fields.json、oc-studio.json）由 Tauri 命令承担，
 * 那部分是 `vault_write_texts` / `vault_write_bytes` 的既有覆盖范围。
 */
import { buildContext, composeNote, type LegacyRows } from '../src/lib/vault/export-dir'
import { applyDocumentBodies } from '../src/lib/vault/markdown-bridge'
import { scanVault } from '../src/lib/vault/scan'
import { applyTagMeta, parseTagMeta, serializeTagMeta, tagMetaFromTags } from '../src/lib/vault/vault-tags'
import { setCustomFieldKeys } from '../src/lib/vault/vault-field-keys'
import { DEFAULT_FOLDER } from '../src/lib/vault/vault-paths'
import type { VaultStorableKind } from '../src/lib/vault/types'
import type { Character, Country, Event, Tag, WorldEntry } from '../src/types'

// ── 断言与汇总 ──────────────────────────────────────────────────────────

const failures: string[] = []
let checks = 0

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1
  if (condition) return
  failures.push(detail === undefined ? label : `${label}\n      ${detail}`)
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(label, a === b, `期望 ${b}\n      实际 ${a}`)
}

// ── 造一份「只有 Dexie 的旧库」 ──────────────────────────────────────────

const tags: Tag[] = [
  { id: 1, name: '主角', category: '角色', color: '#FF6B6B' },
  { id: 2, name: '旧城', category: '地点', color: '#96CEB4' },
]

const countries: Country[] = [
  {
    id: 1,
    name: '北境',
    aliases: [],
    parentId: null,
    description: '雪原上的王国',
    system: '君主制',
    geography: '雪山与峡湾',
    culture: '尚武',
    characters: [1],
    events: [1],
    tags: [2],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 1,
  },
]

const characters: Character[] = [
  {
    id: 1,
    name: '凯尔',
    aliases: ['凯'],
    race: '人类',
    element: '火',
    occupation: '铁匠',
    faction: '北境军',
    nationalityLegacy: '',
    countryId: 1,
    height: '190',
    birthday: '06-04',
    avatarUrl: '附件/凯尔.png',
    bio: '沉默的铁匠',
    lifeStory: '雪线之战里丢了一只手',
    relatedCharacters: [{ characterId: 2, name: '阿尔法', relation: '挚友' }],
    gallery: [{ url: '附件/凯尔-立绘.png', caption: '常服' }],
    avatars: [{ url: '附件/凯尔-头像.png', type: 'portrait' }],
    tags: [1, 2],
    custom: { favoriteFood: '烤鱼' },
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 1,
  },
  {
    id: 2,
    name: '阿尔法',
    aliases: [],
    race: '精灵',
    element: '风',
    occupation: '游侠',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
    createdAt: 2,
    updatedAt: 2,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 2,
  },
]

const events: Event[] = [
  {
    id: 1,
    title: '雪线之战',
    aliases: [],
    time: '纪元 302 年冬',
    location: '断脊关',
    summary: '北境与南方的第一场正面冲突',
    content: '',
    characters: [1, 2],
    countries: [1],
    headerUrl: '附件/战场.png',
    parentEventId: null,
    relations: [{ targetId: 2, relation: '余波' }],
    tags: [1],
    images: [{ url: '附件/战场-2.png', caption: '开战' }],
    isMajor: true,
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 1,
  },
  {
    id: 2,
    title: '余烬',
    aliases: [],
    time: '纪元 305 年',
    location: '断脊关废墟',
    summary: '',
    content: '',
    characters: [],
    parentEventId: 1,
    relations: [],
    tags: [],
    images: [],
    isMajor: false,
    createdAt: 2,
    updatedAt: 2,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 2,
  },
]

const doc = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

const worldEntries: WorldEntry[] = [
  {
    id: 1,
    title: '世界树',
    aliases: [],
    content: doc('支撑世界的巨树'),
    category: '神话',
    parentId: null,
    order: 1,
    isConcept: false,
    references: [],
    tags: [2],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'local',
    _lastModified: 1,
  },
]

const rows: LegacyRows = {
  characters,
  countries,
  events,
  worldEntries,
  tags,
  periods: [
    { id: 1, name: '黎明纪元', startTime: '纪元 1 年', endTime: '纪元 300 年', color: '#FF6B6B' },
  ],
  meta: {
    id: 1,
    worldName: '灰烬纪年',
    tagline: '一场没打完的战争',
    coverUrl: '附件/封面.png',
    updatedAt: 1,
  },
}

// ── 全量物化（与 exportLegacyToFolder 同一套拼装规则） ───────────────────

// 自定义字段的 key 要先登记，否则序列化不会写它（这正是迁移必须带 fields.json 的原因）
setCustomFieldKeys({ character: ['favoriteFood'] })

const ctx = buildContext(rows)
const files: { relPath: string; content: string; size: number; mtimeMs: number }[] = []

function emit(kind: VaultStorableKind, title: string, row: unknown): void {
  const relPath = `${DEFAULT_FOLDER[kind]}/${title}.md`
  const content = composeNote(kind, row, ctx)
  files.push({ relPath, content, size: content.length, mtimeMs: 0 })
}

emit('country', '北境', countries[0])
emit('character', '凯尔', characters[0])
emit('character', '阿尔法', characters[1])
emit('event', '雪线之战', events[0])
emit('event', '余烬', events[1])
emit('worldEntry', '世界树', worldEntries[0])
emit('period', '黎明纪元', rows.periods[0])

const scan = scanVault({ root: '/memory', files, skippedDirs: [], marker: null })
applyDocumentBodies(scan)

// 标签元数据走 tags.json（vault 里标签没有独立文件）
const tagMeta = parseTagMeta(serializeTagMeta(tagMetaFromTags(tags)))

// ── 断言 ────────────────────────────────────────────────────────────────

eq('迁移出的文件数', files.length, 7)
eq(
  '扫描回来的数量（角色/国家/事件/词条/标签/时期）',
  [
    scan.dataset.characters.length,
    scan.dataset.countries.length,
    scan.dataset.events.length,
    scan.dataset.worldEntries.length,
    scan.dataset.tags.length,
    scan.dataset.periods.length,
  ],
  [2, 1, 2, 1, 2, 1],
)

const period = scan.dataset.periods[0]?.entity
if (period === undefined) {
  failures.push('找不到读回来的时期')
} else {
  eq(
    '时期 · 名字/起止/颜色',
    [period.name, period.startTime, period.endTime, period.color],
    ['黎明纪元', '纪元 1 年', '纪元 300 年', '#FF6B6B'],
  )
}

const character = scan.dataset.characters.find((item) => item.entity.name === '凯尔')?.entity
if (character === undefined) {
  failures.push('找不到读回来的角色「凯尔」')
} else {
  eq('角色 · 名字', character.name, '凯尔')
  eq('角色 · 别名', character.aliases, ['凯'])
  eq('角色 · 种族/元素/职业', [character.race, character.element, character.occupation], ['人类', '火', '铁匠'])
  eq('角色 · 阵营', character.faction, '北境军')
  eq('角色 · 身高/生日', [character.height, character.birthday], ['190', '06-04'])
  eq('角色 · 头像引用', character.avatarUrl, '附件/凯尔.png')
  eq('角色 · 简介', character.bio, '沉默的铁匠')
  eq('角色 · 旧版人生故事', character.lifeStory, '雪线之战里丢了一只手')
  const countryOfCharacter = scan.dataset.countries.find((item) => item.entity.id === character.countryId)
  eq('角色 · 所属国家解析', countryOfCharacter?.entity.name, '北境')
  eq(
    '角色 · 关系（名字 + 关系）',
    character.relatedCharacters.map((item) => [item.name, item.relation]),
    [['阿尔法', '挚友']],
  )
  eq('角色 · 立绘', character.gallery.map((item) => [item.url, item.caption]), [['附件/凯尔-立绘.png', '常服']])
  eq('角色 · 头像组', character.avatars.map((item) => [item.url, item.type]), [['附件/凯尔-头像.png', 'portrait']])
  const tagNames = character.tags
    .map((id) => scan.dataset.tags.find((item) => item.entity.id === id)?.entity.name)
    .sort()
  eq('角色 · 标签', tagNames, ['主角', '旧城'])
  eq('角色 · 自定义字段', character.custom?.favoriteFood, '烤鱼')
}

const event = scan.dataset.events[0]?.entity
if (event === undefined) {
  failures.push('找不到读回来的事件')
} else {
  eq('事件 · 标题/时间/地点', [event.title, event.time, event.location], ['雪线之战', '纪元 302 年冬', '断脊关'])
  eq('事件 · 概要', event.summary, '北境与南方的第一场正面冲突')
  eq('事件 · 头图', event.headerUrl, '附件/战场.png')
  eq('事件 · 图集', event.images.map((item) => [item.url, item.caption]), [['附件/战场-2.png', '开战']])
  const involved = event.characters
    .map((id) => scan.dataset.characters.find((item) => item.entity.id === id)?.entity.name)
    .sort()
  eq('事件 · 参与角色', involved, ['凯尔', '阿尔法'])
  const relationTargets = event.relations.map(
    (item) => scan.dataset.events.find((row2) => row2.entity.id === item.targetId)?.entity.title,
  )
  eq('事件 · 关联事件', relationTargets, ['余烬'])
}

const worldEntry = scan.dataset.worldEntries[0]?.entity
if (worldEntry === undefined) {
  failures.push('找不到读回来的词条')
} else {
  eq('词条 · 标题', worldEntry.title, '世界树')
  eq('词条 · 分类', worldEntry.category, '神话')
  const parsed = JSON.parse(worldEntry.content) as { content?: { content?: { text?: string }[] }[] }
  eq('词条 · 正文', parsed.content?.[0]?.content?.[0]?.text, '支撑世界的巨树')
}

const country = scan.dataset.countries[0]?.entity
if (country === undefined) {
  failures.push('找不到读回来的国家')
} else {
  eq('国家 · 制度/地理/文化', [country.system, country.geography, country.culture], ['君主制', '雪山与峡湾', '尚武'])
  eq('国家 · 描述', country.description, '雪原上的王国')
}

const tagged = applyTagMeta(scan.dataset.tags.map((item) => item.entity), tagMeta)
eq(
  '标签 · tags.json 颜色/分类',
  tagged.map((item) => `${item.name}|${item.color}|${item.category}`).sort(),
  ['主角|#FF6B6B|角色', '旧城|#96CEB4|地点'].sort(),
)

// 生成的文件里不该出现 `undefined` / `[object Object]` 这类脏值
const dirty = files.filter((file) => /:\s*(undefined|\[object Object\])\s*$/m.test(file.content))
check('生成的 frontmatter 没有脏值', dirty.length === 0, dirty.map((file) => file.relPath).join(', '))

// 每个文件都该以换行结尾、都该有 frontmatter 块
const malformed = files.filter((file) => !file.content.endsWith('\n') || !file.content.startsWith('---\n'))
check('文件头尾格式', malformed.length === 0, malformed.map((file) => file.relPath).join(', '))

// ── 结果 ────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log(`✓ 老数据迁移自检通过（${checks} 项断言）`)
  process.exit(0)
}

console.error(`✗ ${failures.length} / ${checks} 项断言失败：\n`)
for (const failure of failures) console.error(`  - ${failure}\n`)
process.exit(1)
