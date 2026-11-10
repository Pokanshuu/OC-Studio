/**
 * 助手插件自检：`npx tsx scripts/agent-plugin-check.ts`（`npm run audit:agent`）
 *
 * 验的是**接缝**，不是插件本身（插件原样搬自 Simple-Agent，它有自己的测试）：
 * - 全部设定库工具的 schema 真的进了 `ALL_TOOLS`（提示词靠它，漏了就白搭）
 * - 执行器把名字翻成能力层的调用，参数按不可信输入校验
 * - 不归宿主管的名字必须回 `null`，让插件继续走自己的文件工具
 * - 调用方身份是 `agent:assistant` + 只读权限（写入一律不放）
 *
 * 用内存 store，不碰 Dexie / 文件系统。
 */
import { buildCodexSlice, createCapabilities } from '../src/lib/capabilities'
import {
  ADVERTISED_LIBRARY_TOOLS,
  AGENT_CALLER,
  LIBRARY_TOOL_NAMES,
  MERGED_LIBRARY_TOOLS,
  capabilityFootnote,
  createLibraryToolExecutor,
  type LibraryCatalog,
} from '../src/lib/capabilities/agent-tools'
import { READ_PERMISSION, type Caller, type CapabilityStore, type EntityKind } from '../src/lib/capabilities/types'
import { AGENT_PLUGIN, OFFICIAL_PLUGINS } from '../src/lib/plugins/official'
import { hasPermission, isPluginActive } from '../src/lib/plugins/store'
import { agentContextOpener, agentContextTitle } from '../src/lib/plugins/agent-bridge'
import { emptyAgentSessionContext, hasAgentSessionContext } from '../src/lib/plugins/agent-session'
import { ALL_TOOLS, toOpenAiTools, toolByName, toolSummary } from '../src/plugins/agent/core/agent/tools'
import { clipToolResult } from '../src/plugins/agent/core/agent/budget'
import { runAgentLoop } from '../src/plugins/agent/core/agent/loop'
import { DEFAULT_WRITING_SKILLS, writingSkillsPrompt } from '../src/plugins/agent/core/agent/writing'
import { buildSystemPrompt, editablePrompt } from '../src/plugins/agent/core/agent/prompt'
import { parseSseLine, ToolCallAccumulator } from '../src/plugins/agent/core/sseParser'
import { buildChatRequest, messageToOut } from '../src/plugins/agent/core/chatRequest'
import {
  PROVIDERS,
  chatCompletionsUrl,
  modelsUrl,
  normalizeModelId,
} from '../src/plugins/agent/core/provider'
import { bodyDocFromMarkdown } from '../src/lib/vault/write-body'
import { createVaultSession, setVaultSession } from '../src/lib/vault/vault-session'
import type { Character, Country, Event, Tag, WorldEntry } from '../src/types'
import type { Message } from '../src/plugins/agent/core/types'

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

function country(input: Partial<Country> & Pick<Country, 'id' | 'name'>): Country {
  return {
    aliases: [], parentId: null, description: '', system: '', geography: '', culture: '',
    tags: [], createdAt: 0, updatedAt: 0, deleted: false, _syncStatus: 'synced',
    _lastModified: 0, ...input,
  }
}

const characters: Character[] = [
  character({
    id: 7,
    name: '林知遥',
    aliases: ['遥'],
    race: '人类',
    occupation: '测绘师',
    bio: '会看星图。',
    tags: [1],
    updatedAt: 200,
    relatedCharacters: [{ characterId: 8, name: '沈砚', relation: '同门' }],
  }),
  character({ id: 8, name: '沈砚', bio: '话少。', updatedAt: 100, isMajor: true }),
]

function worldEntry(input: Partial<WorldEntry> & Pick<WorldEntry, 'id' | 'title'>): WorldEntry {
  return {
    content: '', category: '', parentId: null, order: 0, isConcept: false,
    relations: [], references: [], tags: [], createdAt: 0, updatedAt: 0,
    deleted: false, _syncStatus: 'synced', _lastModified: 0, ...input,
  }
}

/** 一条词条，给 parentId / 关系图用例当目标 */
const worldEntries: WorldEntry[] = [worldEntry({ id: 3, title: '元素与生命树' })]

const tags: Tag[] = [{ id: 1, name: '主角', category: '', color: 'stone' }]

/**
 * 内存 store。`CapabilityStore` 的三个方法是**泛型**的（按 kind 收窄返回类型），
 * 内存实现没法逐分支表达这一点，所以先按宽类型写、再收成契约类型。
 */
const store = {
  async list(kind: EntityKind): Promise<Array<Character | Event | Country | WorldEntry>> {
    if (kind === 'character') return characters
    if (kind === 'world') return worldEntries
    return []
  },
  async get(kind: EntityKind, id: number): Promise<Character | Event | Country | WorldEntry | null> {
    if (kind === 'character') return characters.find((item) => item.id === id) ?? null
    if (kind === 'world') return worldEntries.find((item) => item.id === id) ?? null
    return null
  },
  async tags(): Promise<Tag[]> {
    return tags
  },
} as unknown as CapabilityStore

const resolve = createLibraryToolExecutor(createCapabilities(store))

async function main(): Promise<void> {
  // ── schema 进了提示词面 ────────────────────────────────────────────────
  for (const name of ADVERTISED_LIBRARY_TOOLS) {
    const spec = toolByName(name)
    check(`schema 存在：${name}`, Boolean(spec))
    const readOnly = spec?.category === 'read'
    check(
      `${name} ${readOnly ? '只读免审批' : '写入要审批'}`,
      (readOnly ? true : spec?.category === 'write') && spec?.requiresApproval === !readOnly,
    )
  }

  // 合并掉的旧工具：还在执行器里认（旧设置存着的名字不会变成「未知工具」），
  // 但**不该再出现在提示词里** —— 模型看不见，就不会在两个重叠工具之间选错
  for (const [legacy, target] of Object.entries(MERGED_LIBRARY_TOOLS)) {
    check(`合并别名 ${legacy} 不在提示词里`, toolByName(legacy) === undefined)
    check(`合并别名 ${legacy} 仍归宿主执行`, (LIBRARY_TOOL_NAMES as readonly string[]).includes(legacy))
    check(`合并别名 ${legacy} 指向 ${target}`, (LIBRARY_TOOL_NAMES as readonly string[]).includes(target))
  }

  const openAi = toOpenAiTools(ALL_TOOLS).map((tool) => {
    const fn = (tool as { function?: { name?: string } }).function
    return fn?.name ?? ''
  })
  check('OpenAI tools 里带着这些库工具', ADVERTISED_LIBRARY_TOOLS.every((name) => openAi.includes(name)))
  check('原有文件工具没被挤掉', openAi.includes('read_file') && openAi.includes('todo_write'))

  // 摘要按 kind / id 显示，工具卡上才不是空白
  check(
    'toolSummary 认 library_read',
    toolSummary({ id: 'c1', name: 'library_read', args: '{"kind":"character","id":7}' } as never) === 'character #7',
  )
  check(
    'toolSummary 认 library_list 省略 kind',
    toolSummary({ id: 'c2', name: 'library_list', args: '{}' } as never) === '全部',
  )

  // ── 执行器：只认自己的名字 ────────────────────────────────────────────
  check('文件工具不归宿主管', (await resolve('read_file', { path: 'a.md' })) === null)
  check('未知名字不归宿主', (await resolve('nope', {})) === null)

  // ── library_list ──────────────────────────────────────────────────────
  const overview = await resolve('library_list', {})
  check('概览不是错误', overview?.isError === false)
  check('概览里有角色计数', overview?.content.includes('角色 2 条') === true, overview?.content.slice(0, 80))

  const listed = await resolve('library_list', { kind: 'character', limit: 1 })
  check('按类型列受 limit 约束', listed?.content.includes('共列出 1 条') === true, listed?.content)
  check('列表带别名与标签', listed?.content.includes('别名 遥') === true && listed?.content.includes('标签 主角') === true)

  const emptyKind = await resolve('library_list', { kind: 'event' })
  check('空类型给一句人话', emptyKind?.content === '库里还没有事件。')

  // ── library_list 筛选（先筛再截断）─────────────────────────────────────
  const onlyMajor = await resolve('library_list', { kind: 'character', isMajor: true })
  check('isMajor 只留主要角色', onlyMajor?.content.includes('沈砚') === true && onlyMajor?.content.includes('林知遥') === false)
  const byTagList = await resolve('library_list', { kind: 'character', tag: '主角' })
  check('tag 筛选按标签名', byTagList?.content.includes('林知遥') === true && byTagList?.content.includes('沈砚') === false)
  const noCategory = await resolve('library_list', { kind: 'world', category: '宠物' })
  check('分类筛选没命中时说明原因', noCategory?.content.includes('没有符合') === true)
  const filterNoKind = await resolve('library_list', { category: '宠物' })
  check('筛选必须配合 kind', filterNoKind?.isError === true)

  // ── library_read ──────────────────────────────────────────────────────
  const read = await resolve('library_read', { kind: 'character', id: 7 })
  check('读到正文装配成 markdown', read?.content.startsWith('# 林知遥（角色）') === true, read?.content.slice(0, 40))
  check('字段进了切片', read?.content.includes('测绘师') === true)
  check('关系进了切片', read?.content.includes('沈砚（同门）') === true)
  check(
    '读结果末尾带可写脚注',
    read?.content.includes('可写脚注：可写 race') === true &&
      read?.content.includes('其余界面维护') === true,
    read?.content.slice(-80),
  )

  const longEntry = {
    kind: 'character' as const,
    id: 1,
    title: '长文',
    aliases: [],
    fields: [],
    custom: {},
    relations: [],
    events: [],
    tags: [],
    body: '字'.repeat(5000),
  }
  const clipped = buildCodexSlice(longEntry, { bodyLimit: 4000 })
  check(
    '正文默认截 4k 并告诉模型怎么取全文',
    clipped.includes('正文已截断') === true && clipped.length < 4300,
    String(clipped.length),
  )
  const omitted = buildCodexSlice(longEntry, { omitBody: true })
  check('写回执时不再带正文', omitted.includes('正文：') === false && omitted.length < 200)

  const withRefs = buildCodexSlice({
    ...longEntry,
    body: '',
    parent: { id: 9, title: '灰烬联邦' },
    media: { flag: '附件/旗.png' },
  })
  check(
    '上级与已设置的图片槽位进了切片',
    withRefs.includes('上级：灰烬联邦（#9）') === true && withRefs.includes('flag=附件/旗.png') === true,
    withRefs,
  )

  check(
    '国家的读脚注点明 parentId 由表格页维护',
    capabilityFootnote('country').includes('新增子项') === true &&
      capabilityFootnote('country').includes('工具不写') === true,
    capabilityFootnote('country'),
  )

  // P0 验收：国家层级是真的（表格页「新增子项」能建），读路径必须看得见
  const countryRows = [
    country({ id: 1, name: '灰烬联邦' }),
    country({ id: 2, name: '灰烬自治领', parentId: 1 }),
  ]
  const countryCaps = createCapabilities({
    async list(kind: EntityKind) {
      return kind === 'country' ? countryRows : []
    },
    async get(kind: EntityKind, id: number) {
      return kind === 'country' ? (countryRows.find((row) => row.id === id) ?? null) : null
    },
    async tags() {
      return []
    },
  } as unknown as CapabilityStore)
  const childCountry = await countryCaps.getEntity(AGENT_CALLER, 'country', 2)
  check(
    '建子国家能读回父级',
    countryCaps.buildCodexSlice(childCountry).includes('上级：灰烬联邦（#1）') === true,
    countryCaps.buildCodexSlice(childCountry),
  )

  const badKind = await resolve('library_read', { kind: 'pet', id: 7 })
  check('非法 kind 报错不抛异常', badKind?.isError === true && badKind?.content.includes('kind') === true)

  const missingId = await resolve('library_read', { kind: 'character', id: 999 })
  check('找不到的 id 回可读错误', missingId?.isError === true && missingId?.content.includes('999') === true)

  // ── library_search ────────────────────────────────────────────────────
  const byAlias = await resolve('library_search', { query: '遥' })
  check('按别名搜到', byAlias?.content.includes('林知遥') === true)
  const byTag = await resolve('library_search', { query: '主角' })
  check('按标签搜到', byTag?.content.includes('林知遥') === true)
  const noQuery = await resolve('library_search', { query: '   ' })
  check('空 query 报错', noQuery?.isError === true)
  const noHit = await resolve('library_search', { query: '不存在的名字' })
  check(
    '没命中也给一句话',
    noHit?.content === '没有匹配「不存在的名字」的条目（标题、别名、标签、正文都看过了）。',
    noHit?.content,
  )

  // 正文搜索：查重时最实际的一条（「这个设定是不是早写过」）
  const byBody = await resolve('library_search', { query: '星图' })
  check('正文命中能搜到', byBody?.content.includes('林知遥') === true, byBody?.content)
  check('正文命中会标出来', byBody?.content.includes('正文命中') === true, byBody?.content)
  const namesOnly = await resolve('library_search', { query: '星图', include_body: false })
  check('include_body=false 只搜名字', namesOnly?.content.includes('没有匹配') === true, namesOnly?.content)

  // ── library_graph ─────────────────────────────────────────────────────
  const graph = await resolve('library_graph', { kind: 'character', id: 7, hops: 1 })
  check('关系图带出邻居', graph?.content.includes('沈砚') === true)
  check('关系图里含中心条目', graph?.content.includes('# 林知遥') === true)

  // ── library_set_fields（写）────────────────────────────────────────────
  const noWriter = await resolve('library_set_fields', { kind: 'character', id: 7, fields: { race: '精灵' } })
  check('没注入 writer 时写不了', noWriter?.isError === true && noWriter?.content === '这个环境不能写库。')

  const writes: Array<{ kind: string; id: number; patch: Record<string, string> }> = []
  const bodies: Array<{ kind: string; id: number; markdown: string }> = []
  const links: Array<{ from: string; fromId: number; to: string; toId: number; relation: string }> = []
  const creates: Array<{
    kind: string
    id: number
    title: string
    fields: Record<string, string>
    category?: string
    template?: string
    parentId?: number | null
  }> = []
  const deletes: Array<{ kind: string; id: number }> = []
  const tagWrites: Array<{ kind: string; id: number; names: string[] }> = []
  const customWrites: Array<{ kind: string; id: number; fields: Record<string, string> }> = []
  const mediaWrites: Array<{ kind: string; id: number; slot: string; path: string }> = []
  const renames: Array<{ kind: string; id: number; title: string; aliases?: string[] }> = []
  const placements: Array<{
    id: number
    category?: string
    template?: string
    parentId?: number | null
  }> = []
  const categoryCreates: Array<{
    name: string
    template?: string
    icon?: string
    fields?: string[]
    labels?: Record<string, string>
  }> = []
  const novelWrites: Array<{
    id: number
    author?: string
    synopsis?: string
    targetWords?: number
    notes?: string
    cover?: string
  }> = []
  const imageImports: Array<{
    kind: string
    id: number
    slot: string
    url: string
    filename?: string
  }> = []
  /** 回执用例：写完后宿主能读到路径 / 改动键 / 版本 */
  const receipts: Array<{ kind: string; id: number; keys: string[] }> = []
  const writer = {
    async setFields(kind: EntityKind, id: number, patch: Record<string, string>) {
      writes.push({ kind, id, patch })
      const row = characters.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
    },
    async setBody(kind: EntityKind, id: number, markdown: string) {
      bodies.push({ kind, id, markdown })
      const row = characters.find((item) => item.id === id)
      if (row) Object.assign(row, { bio: markdown })
    },
    async receipt(kind: EntityKind, id: number, keys: string[]) {
      receipts.push({ kind, id, keys })
      const row = characters.find((item) => item.id === id)
      return {
        path: kind === 'character' ? `角色/${row?.name ?? id}.md` : `${kind}/${id}.md`,
        keys,
        hash: 'abcdef123456',
        prevHash: '0123456789ab',
      }
    },
    async link(
      from: { kind: EntityKind; id: number },
      to: { kind: EntityKind; id: number },
      relation: string,
      toName: string,
    ) {
      // 幂等语义与真实现一致：同一对已经连过就返回 changed: false
      const exists = links.some(
        (item) => item.fromId === from.id && item.to === to.kind && item.toId === to.id,
      )
      if (exists) return { changed: false }
      links.push({ from: from.kind, fromId: from.id, to: to.kind, toId: to.id, relation })
      const row = characters.find((item) => item.id === from.id)
      if (row) {
        row.relatedCharacters = [
          ...(row.relatedCharacters ?? []),
          { characterId: to.id, name: toName, relation },
        ]
      }
      return { changed: true }
    },
    async create(
      kind: EntityKind,
      input: {
        title: string
        fields: Record<string, string>
        category?: string
        template?: string
        parentId?: number | null
      },
    ) {
      const id = 100 + creates.length
      creates.push({
        kind,
        id,
        title: input.title,
        fields: input.fields,
        category: input.category,
        template: input.template,
        parentId: input.parentId,
      })
      if (kind === 'character') {
        characters.push(character({ id, name: input.title, ...input.fields }))
      }
      return id
    },
    async delete(kind: EntityKind, id: number) {
      deletes.push({ kind, id })
      const index = characters.findIndex((item) => item.id === id)
      if (index >= 0) characters.splice(index, 1)
    },
    async setTags(kind: EntityKind, id: number, names: string[]) {
      tagWrites.push({ kind, id, names })
      return names.map((name, index) => ({ id: 200 + index, name }))
    },
    async setCustom(kind: EntityKind, id: number, fields: Record<string, string>) {
      customWrites.push({ kind, id, fields })
    },
    async setMedia(kind: EntityKind, id: number, slot: string, path: string) {
      mediaWrites.push({ kind, id, slot, path })
    },
    async rename(kind: EntityKind, id: number, title: string, aliases?: string[]) {
      renames.push({ kind, id, title, aliases })
    },
    async setPlacement(
      id: number,
      input: { category?: string; template?: string; parentId?: number | null },
    ) {
      placements.push({ id, ...input })
    },
    async createCategory(input: {
      name: string
      template?: string
      icon?: string
      fields?: string[]
      labels?: Record<string, string>
    }) {
      categoryCreates.push(input)
      return {
        id: 'cat-test',
        name: input.name,
        template: input.template ?? 'entry',
        group: input.fields ? 'group-test' : undefined,
        fields: input.fields,
      }
    },
    async setNovel(
      id: number,
      input: { author?: string; synopsis?: string; targetWords?: number; notes?: string; cover?: string },
    ) {
      novelWrites.push({ id, ...input })
    },
    async importImage(kind: EntityKind, id: number, slot: string, url: string, filename?: string) {
      imageImports.push({ kind, id, slot, url, filename })
      return { path: `附件/${filename ?? 'image.png'}`, bytes: 8 }
    },
  }
  const resolveW = createLibraryToolExecutor(createCapabilities(store), writer)

  const wrote = await resolveW('library_set_fields', {
    kind: 'character',
    id: 7,
    fields: { race: '精灵', occupation: '观星人' },
  })
  check('写入成功', wrote?.isError === false, wrote?.content.slice(0, 60))
  check('写入落到 writer 上', writes.length === 1 && writes[0]?.kind === 'character' && writes[0]?.id === 7)
  check('只带白名单字段', Object.keys(writes[0]?.patch ?? {}).join('、') === 'race、occupation')
  check('写完读回来给模型看', wrote?.content.includes('精灵') === true && wrote?.content.includes('观星人') === true)
  check(
    '写入带三行回执（路径 / 改动键 / 版本）',
    wrote?.content.includes('已写入 角色/林知遥.md') === true &&
      wrote?.content.includes('改动：race、occupation') === true &&
      wrote?.content.includes('版本：abcdef1') === true,
    wrote?.content,
  )
  check('回执查询带上本次改动键', receipts[0]?.keys.join('、') === 'race、occupation')
  check('回执之后不再重复回放正文', wrote?.content.includes('正文：') === false)

  const mixed = await resolveW('library_set_fields', {
    kind: 'character',
    id: 8,
    fields: { bio: '剑客。', name: '改名' },
  })
  check('不认识的键被挡下但仍写其余', mixed?.isError === false && mixed?.content.includes('内置字段 bio') === true, mixed?.content.slice(0, 50))
  check('被挡的键要点出来', JSON.stringify(mixed?.data).includes('name') === true)
  check(
    '界面维护字段按 ui-only 拒绝并给去处',
    mixed?.content.includes('[ui-only] name') === true && mixed?.content.includes('library_rename') === true,
    mixed?.content,
  )

  const uiOnly = await resolveW('library_set_fields', { kind: 'world', id: 3, fields: { parentId: '2' } })
  check(
    'parentId 这类字段给出 ui-only 与维护入口',
    uiOnly?.isError === true && uiOnly?.content.includes('[ui-only] parentId') === true,
    uiOnly?.content,
  )

  const unknownField = await resolveW('library_set_fields', { kind: 'world', id: 3, fields: { race: '人类' } })
  check(
    '别的类型的字段按 unknown-field 拒绝',
    unknownField?.isError === true &&
      unknownField?.content.includes('[unknown-field] race') === true &&
      unknownField?.content.includes('角色的') === true,
    unknownField?.content,
  )

  const onlyRejected = await resolveW('library_set_fields', {
    kind: 'character',
    id: 8,
    fields: { name: '改名' },
  })
  check(
    '全是非法键时明确报错',
    onlyRejected?.isError === true && onlyRejected?.content.includes('create_new') === true,
  )
  check('全非法时不会真去写', writes.length === 2)

  // 自建字段与内置字段共用同一个工具：已有键直接写，新键要 create_new
  const customWrite = await resolveW('library_set_fields', {
    kind: 'character',
    id: 7,
    fields: { 出身: '北境' },
    create_new: true,
  })
  check('create_new 才允许建新自建字段', customWrite?.isError === false && customWrites.length === 1, customWrite?.content.slice(0, 60))
  const customRejected = await resolveW('library_set_fields', {
    kind: 'character',
    id: 7,
    fields: { 不认识的键: 'x' },
  })
  check('不传 create_new 时新键被拒', customRejected?.isError === true)

  const worldWrite = await resolveW('library_set_fields', {
    kind: 'world',
    id: 3,
    fields: { summary: '一句话', chapterOutline: '第一章：开端' },
  })
  check(
    '词条可写 summary / chapterOutline',
    worldWrite?.isError === false && worldWrite?.content.includes('内置字段 summary') === true,
    worldWrite?.content.slice(0, 60),
  )
  const worldTitle = await resolveW('library_set_fields', { kind: 'world', id: 3, fields: { title: 'x' } })
  check('词条标题不能当标量写', worldTitle?.isError === true)

  const emptyFields = await resolveW('library_set_fields', { kind: 'character', id: 7, fields: {} })
  check('空 fields 报错', emptyFields?.isError === true)

  const badFields = await resolveW('library_set_fields', { kind: 'character', id: 7, fields: 'x' })
  check('fields 不是对象时报错', badFields?.isError === true)

  const longValue = 'x'.repeat(5000)
  await resolveW('library_set_fields', { kind: 'character', id: 7, fields: { bio: longValue } })
  const lastPatch = writes[writes.length - 1]?.patch ?? {}
  check('超长值被截断', (lastPatch.bio ?? '').length === 4000)

  // 时间 / 生日：纪年名、月名不能塞进日期列（否则界面三段输入会把它当「年」）
  const badBirthday = await resolveW('library_set_fields', {
    kind: 'character',
    id: 7,
    fields: { birthday: '霜月三日' },
  })
  check(
    '非法日期按 invalid-value 拒绝并给出格式',
    badBirthday?.isError === true &&
      badBirthday?.content.includes('[invalid-value] birthday') === true &&
      badBirthday?.content.includes('1203-04-15') === true,
    badBirthday?.content,
  )
  const normalizedBirthday = await resolveW('library_set_fields', {
    kind: 'character',
    id: 7,
    fields: { birthday: '1203-4-5' },
  })
  check(
    '合法日期补零成 YYYY-MM-DD',
    normalizedBirthday?.isError === false &&
      writes[writes.length - 1]?.patch.birthday === '1203-04-05',
    JSON.stringify(writes[writes.length - 1]?.patch),
  )

  check(
    'toolSummary 认 library_set_fields',
    toolSummary({ id: 'c3', name: 'library_set_fields', args: '{"fields":{"race":"精灵"}}' } as never) === 'race',
  )

  // ── library_set_body（写正文）──────────────────────────────────────────
  const bodyNoWriter = await resolve('library_set_body', { kind: 'character', id: 7, body: '# 新的一节' })
  check('没注入 writer 时写不了正文', bodyNoWriter?.isError === true)

  const bodyOk = await resolveW('library_set_body', { kind: 'character', id: 7, body: '# 新的一节\n\n正文。' })
  check('正文写入成功', bodyOk?.isError === false, bodyOk?.content.slice(0, 50))
  check('正文落到 writer 上', bodies.length === 1 && bodies[0]?.markdown === '# 新的一节\n\n正文。')
  check(
    '正文写入带回执（不再整篇回放）',
    bodyOk?.content.includes('已替换《林知遥》的正文') === true &&
      bodyOk?.content.includes('改动：body') === true &&
      bodyOk?.content.includes('正文。') === false,
    bodyOk?.content,
  )

  const bodyEmpty = await resolveW('library_set_body', { kind: 'character', id: 7, body: '   ' })
  check('空正文被拒（要清正文得走别的路）', bodyEmpty?.isError === true && bodies.length === 1)

  const bodyNotString = await resolveW('library_set_body', { kind: 'character', id: 7, body: 42 })
  check('body 不是字符串时报错', bodyNotString?.isError === true)

  const bodyTooLong = await resolveW('library_set_body', {
    kind: 'character',
    id: 7,
    body: 'x'.repeat(20_001),
  })
  check('超长正文被拒', bodyTooLong?.isError === true && bodyTooLong?.content.includes('太长') === true)
  check('被拒的正文没有真去写', bodies.length === 1)

  const bodyBadId = await resolveW('library_set_body', { kind: 'character', id: 999, body: '# x' })
  check('写不存在的 id 报错而不是静默成功', bodyBadId?.isError === true)

  check(
    'toolSummary 认 library_set_body',
    toolSummary({ id: 'c4', name: 'library_set_body', args: '{"body":"abc"}' } as never) === '3 字',
  )

  // ── 正文写入的 Markdown → 文档桥 ──────────────────────────────────────
  const session = createVaultSession('C:/oc-studio-check')
  session.index.byKey.set('林知遥', [
    { kind: 'character', relPath: '角色/林知遥.md', title: '林知遥', id: 7 },
  ])
  setVaultSession(session)

  const withLink = bodyDocFromMarkdown('# 新的一节\n\n见 [[林知遥]]。') as {
    content?: Array<{ type?: string; content?: Array<{ type?: string; attrs?: { id?: string; entityType?: string } }> }>
  }
  check('正文桥产出 doc', withLink?.content !== undefined && withLink.content.length > 0)
  // 指向**已有实体**的链接建的是 `mention` 节点（和 @ 引用同一形态），不是 wikiLink
  const linkNode = (withLink.content ?? [])
    .flatMap((node) => node.content ?? [])
    .find((node) => node.type === 'mention')
  check(
    '[[…]] 按会话索引解析成引用节点',
    linkNode?.attrs?.id === '7' && linkNode?.attrs?.entityType === 'character',
    JSON.stringify(linkNode),
  )

  setVaultSession(null)
  let degraded: unknown = null
  let threw = false
  try {
    degraded = bodyDocFromMarkdown('见 [[林知遥]]。')
  } catch {
    threw = true
  }
  check('没有会话时不抛异常', !threw)
  check('没有会话时仍产出 doc', degraded !== null)

  // ── library_link（建关系边）────────────────────────────────────────────
  const linkNoWriter = await resolve('library_link', { from: 'character', fromId: 7, to: 'character', toId: 8, relation: '同门' })
  check('没注入 writer 时连不了', linkNoWriter?.isError === true)

  const linked = await resolveW('library_link', { from: 'character', fromId: 7, to: 'character', toId: 8, relation: '同门' })
  check('建边成功', linked?.isError === false, linked?.content.slice(0, 60))
  check('边落到 writer 上', links.length === 1 && links[0]?.from === 'character' && links[0]?.to === 'character')
  check('两边标题都在回执里', linked?.content.includes('林知遥') === true && linked?.content.includes('沈砚') === true)

  const again = await resolveW('library_link', { from: 'character', fromId: 7, to: 'character', toId: 8, relation: '同门' })
  check('同一条边重复连是空操作', again?.isError === false && again?.content.includes('没有改动') === true)
  check('重复连没有再写一次', links.length === 1)

  const selfLink = await resolveW('library_link', { from: 'character', fromId: 7, to: 'character', toId: 7, relation: '自己' })
  check('不能连到自己', selfLink?.isError === true)

  const badPair = await resolveW('library_link', { from: 'country', fromId: 1, to: 'character', toId: 7, relation: '所属' })
  check('国家→角色被拒（真源在角色侧）', badPair?.isError === true && badPair?.content.includes('不支持') === true)

  const emptyRelation = await resolveW('library_link', { from: 'character', fromId: 7, to: 'character', toId: 8, relation: '  ' })
  check('空关系名被拒', emptyRelation?.isError === true)

  const missingTo = await resolveW('library_link', { from: 'character', fromId: 7, to: 'character', toId: 999, relation: '同门' })
  check('目标不存在时报错', missingTo?.isError === true)
  check('目标不存在时没有写边', links.length === 1)

  check(
    'toolSummary 认 library_link',
    toolSummary({ id: 'c5', name: 'library_link', args: '{"toId":8,"relation":"同门"}' } as never) === '同门 → #8',
  )

  // ── library_create（新建条目）──────────────────────────────────────────
  const createNoWriter = await resolve('library_create', { kind: 'character', title: '新人' })
  check('没注入 writer 时建不了', createNoWriter?.isError === true)

  const created = await resolveW('library_create', {
    kind: 'character',
    title: '沈砚的师父',
    fields: { race: '人类', occupation: '铸剑师', name: '改名' },
  })
  check('新建成功', created?.isError === false, created?.content.slice(0, 60))
  check('新建落到 writer 上', creates.length === 1 && creates[0]?.title === '沈砚的师父')
  check('新建只带白名单字段', Object.keys(creates[0]?.fields ?? {}).join('、') === 'race、occupation')
  const badCreateDate = await resolveW('library_create', {
    kind: 'character',
    title: '时间测试',
    fields: { birthday: '霜月三日' },
  })
  check(
    '新建时非法日期直接拒绝，不落库',
    badCreateDate?.isError === true &&
      badCreateDate?.content.includes('不是合法日期') === true &&
      creates.length === 1,
    badCreateDate?.content,
  )
  check('回执里有新 id', created?.content.includes('#100') === true, created?.content.slice(0, 40))

  const duplicate = await resolveW('library_create', { kind: 'character', title: '林知遥' })
  check(
    '同名创建返回既有 id，不建重复',
    duplicate?.isError === false &&
      duplicate?.content.includes('#7') === true &&
      duplicate?.content.includes('没有再建') === true &&
      creates.length === 1,
    duplicate?.content,
  )

  const emptyTitle = await resolveW('library_create', { kind: 'character', title: '   ' })
  check('空标题被拒', emptyTitle?.isError === true && creates.length === 1)

  const longTitle = await resolveW('library_create', { kind: 'character', title: '标'.repeat(120) })
  check('超长标题被截断后仍能建', longTitle?.isError === false && creates.length === 2)

  check('标题截到 80 字', (creates[1]?.title ?? '').length === 80, String((creates[1]?.title ?? '').length))
  const badCreateKind = await resolveW('library_create', { kind: 'pet', title: 'x' })
  check('非法 kind 被拒', badCreateKind?.isError === true && creates.length === 2)

  const badCreateFields = await resolveW('library_create', { kind: 'character', title: 'x', fields: 'nope' })
  check('fields 不是对象时报错', badCreateFields?.isError === true)

  check(
    'toolSummary 认 library_create',
    toolSummary({ id: 'c6', name: 'library_create', args: '{"kind":"character","title":"新人"}' } as never) ===
      '新character · 新人',
  )

  // ── library_delete（软删除，唯一允许的删除路径）────────────────────────
  const deleteNoWriter = await resolve('library_delete', { kind: 'character', id: 7 })
  check('没注入 writer 时删不了', deleteNoWriter?.isError === true)

  const deleted = await resolveW('library_delete', { kind: 'character', id: 8 })
  check('删除成功', deleted?.isError === false, deleted?.content.slice(0, 60))
  check('删除落到 writer 上', deletes.length === 1 && deletes[0]?.kind === 'character' && deletes[0]?.id === 8)
  check('回执说进回收站', deleted?.content.includes('回收站') === true)

  const deleteMissing = await resolveW('library_delete', { kind: 'character', id: 999 })
  check('删不存在的条目报错', deleteMissing?.isError === true && deletes.length === 1)

  check(
    'toolSummary 认 library_delete',
    toolSummary({ id: 'c7', name: 'library_delete', args: '{"kind":"character","id":8}' } as never) ===
      'character #8',
  )

  // ── library_set_tags / set_custom / set_media ──────────────────────────
  const tagsNoWriter = await resolve('library_set_tags', { kind: 'character', id: 7, tags: ['主角'] })
  check('没注入 writer 时打不了标签', tagsNoWriter?.isError === true)

  const tagged = await resolveW('library_set_tags', {
    kind: 'character',
    id: 7,
    tags: ['主角', '  ', '观星人', '主角'],
  })
  check('打标签成功', tagged?.isError === false, tagged?.content.slice(0, 50))
  check(
    '标签去空去重后落到 writer',
    tagWrites.length === 1 && tagWrites[0]?.names.join('、') === '主角、观星人',
  )
  check('回执列出标签', tagged?.content.includes('主角') === true && tagged?.content.includes('观星人') === true)

  const badTags = await resolveW('library_set_tags', { kind: 'character', id: 7, tags: '主角' })
  check('tags 不是数组时报错', badTags?.isError === true)

  // 批量打标签：一次调用改多条（整理库时最常见的动作）
  const batchTags = await resolveW('library_set_tags', {
    kind: 'character',
    ids: [7, 100, 999],
    tags: ['主要'],
  })
  check('批量打标签成功', batchTags?.isError === false, batchTags?.content.slice(0, 60))
  check(
    '批量逐条落到 writer，不存在的 id 不写',
    tagWrites.length === 3 && tagWrites.slice(1).map((item) => item.id).join('、') === '7、100',
    JSON.stringify(tagWrites.map((item) => item.id)),
  )
  check('批量回执点出没找到的 id', JSON.stringify(batchTags?.data).includes('999') === true)
  const batchMissing = await resolveW('library_set_tags', { kind: 'character', ids: [999], tags: ['x'] })
  check('批量全是无效 id 时报错', batchMissing?.isError === true)

  const custom = await resolveW('library_set_fields', {
    kind: 'world',
    id: 3,
    fields: { 学名: 'Elementum', 英文名: 'Element' },
    create_new: true,
  })
  check('写自建字段成功', custom?.isError === false, custom?.content.slice(0, 50))
  check(
    '自建字段落到 writer',
    customWrites.length === 2 &&
      Object.keys(customWrites[1]?.fields ?? {}).join('、') === '学名、英文名',
    JSON.stringify(customWrites.map((item) => item.fields)),
  )
  const emptyCustom = await resolveW('library_set_fields', { kind: 'world', id: 3, fields: {} })
  check('空字段报错', emptyCustom?.isError === true)

  const media = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    path: '附件/avatar.png',
  })
  check('写图片槽位成功', media?.isError === false, media?.content.slice(0, 60))
  check(
    '图片槽位落到 writer',
    mediaWrites.length === 1 &&
      mediaWrites[0]?.slot === 'avatar' &&
      mediaWrites[0]?.path === '附件/avatar.png',
  )
  characters[0].avatarUrl = '附件/avatar.png'
  const replaced = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    path: '附件/avatar-new.png',
  })
  check(
    '换图时指出旧图已不再引用',
    replaced?.isError === false && replaced?.content.includes('旧图：附件/avatar.png') === true,
    replaced?.content,
  )
  characters[0].avatarUrl = ''
  const badSlot = await resolveW('library_set_media', {
    kind: 'event',
    id: 1,
    slot: 'cover',
    path: '附件/a.png',
  })
  check('类型不支持这个槽位时报错', badSlot?.isError === true && String(badSlot?.content).includes('槽位'))
  const absolute = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    path: 'C:/x.png',
  })
  check('绝对路径被拒', absolute?.isError === true)

  const renamed = await resolveW('library_rename', {
    kind: 'character',
    id: 7,
    title: '林知遥·改',
    aliases: ['遥', '  '],
  })
  check('改名成功', renamed?.isError === false, renamed?.content.slice(0, 50))
  check(
    '改名与别名落到 writer',
    renames.length === 1 &&
      renames[0]?.title === '林知遥·改' &&
      renames[0]?.aliases?.join('、') === '遥',
  )
  const emptyRename = await resolveW('library_rename', { kind: 'character', id: 7, title: '   ' })
  check('空标题改名被拒', emptyRename?.isError === true)
  const badAliases = await resolveW('library_rename', {
    kind: 'character',
    id: 7,
    title: 'x',
    aliases: '遥',
  })
  check('aliases 不是数组时报错', badAliases?.isError === true)

  const placed = await resolveW('library_set_placement', {
    kind: 'world',
    id: 1,
    category: '宠物',
    template: 'pet',
    parentId: 3,
  })
  check('归类成功', placed?.isError === false, placed?.content.slice(0, 50))
  check(
    '归类参数落到 writer',
    placements.length === 1 &&
      placements[0]?.category === '宠物' &&
      placements[0]?.template === 'pet' &&
      placements[0]?.parentId === 3,
  )
  const placedRoot = await resolveW('library_set_placement', { kind: 'world', id: 1, parentId: null })
  check('parentId=null 变根', placedRoot?.isError === false && placements[1]?.parentId === null)
  const wrongPlacementKind = await resolveW('library_set_placement', { kind: 'character', id: 7, category: 'x' })
  check('非词条不能归类', wrongPlacementKind?.isError === true)
  const emptyPlacement = await resolveW('library_set_placement', { kind: 'world', id: 1 })
  check('什么都不给时报错', emptyPlacement?.isError === true)
  const selfParent = await resolveW('library_set_placement', { kind: 'world', id: 1, parentId: 1 })
  check('不能挂到自己下面', selfParent?.isError === true)

  const categoryNoWriter = await resolve('library_create_category', { name: '元素' })
  check('没注入 writer 时建不了分类', categoryNoWriter?.isError === true)
  const category = await resolveW('library_create_category', {
    name: '元素',
    icon: 'sparkles',
    fields: ['原子序数', '符号'],
  })
  check('建分类成功', category?.isError === false, category?.content.slice(0, 50))
  check(
    '分类参数落到 writer',
    categoryCreates.length === 1 &&
      categoryCreates[0]?.name === '元素' &&
      categoryCreates[0]?.fields?.join('、') === '原子序数、符号',
  )
  const emptyCategory = await resolveW('library_create_category', { name: '   ' })
  check('空分类名被拒', emptyCategory?.isError === true)

  const novel = await resolveW('library_set_novel', {
    id: 3,
    author: '某人',
    synopsis: '一个故事。',
    targetWords: 12000,
  })
  check('作品信息写入成功', novel?.isError === false, novel?.content.slice(0, 50))
  check(
    '作品信息落到 writer',
    novelWrites.length === 1 &&
      novelWrites[0]?.author === '某人' &&
      novelWrites[0]?.targetWords === 12000,
  )
  const emptyNovel = await resolveW('library_set_novel', { id: 3 })
  check('什么都不给时作品信息报错', emptyNovel?.isError === true)

  // 合并后的 library_set_media：给 url 就下载，给 path 就引用；旧名字 import_image 仍然认
  const imported = await resolveW('library_import_image', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    url: 'https://example.com/avatar.png',
  })
  check('旧名字 import_image 仍然可用', imported?.isError === false, imported?.content.slice(0, 60))
  check(
    '图片导入参数落到 writer',
    imageImports.length === 1 &&
      imageImports[0]?.slot === 'avatar' &&
      imageImports[0]?.url === 'https://example.com/avatar.png',
  )
  const urlMedia = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'header',
    url: 'https://example.com/header.png',
  })
  check('set_media 给 url 就下载', urlMedia?.isError === false && imageImports.length === 2)
  const neitherMedia = await resolveW('library_set_media', { kind: 'character', id: 7, slot: 'avatar' })
  check('url / path 都不给时报错', neitherMedia?.isError === true)
  const bothMedia = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    url: 'https://example.com/a.png',
    path: '附件/a.png',
  })
  check('url 与 path 同时给时报错', bothMedia?.isError === true)
  const badImageUrl = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'avatar',
    url: 'ftp://example.com/a.png',
  })
  check('非 http(s) 图片地址被拒', badImageUrl?.isError === true)
  const badImageSlot = await resolveW('library_set_media', {
    kind: 'character',
    id: 7,
    slot: 'cover',
    url: 'https://example.com/a.png',
  })
  check('角色没有 cover 槽位', badImageSlot?.isError === true)

  // ── library_templates（库目录：模板组件 / 字段组 / 分类）───────────────
  const catalog: LibraryCatalog = {
    async describe() {
      return {
        templates: [
          {
            id: 'entry',
            name: '词条',
            components: [
              { id: 'cover', enabled: true },
              { id: 'info', enabled: true },
              { id: 'body', enabled: true },
            ],
            fields: [{ key: '学名', label: '学名' }],
          },
        ],
        categories: [{ name: '宠物', template: 'pet', enabled: true }],
      }
    },
    // 模板声明的键：武器 / 宠物条目上可能一次都没写过值
    async declaredFields(kind: EntityKind) {
      return kind === 'world' ? ['学名'] : []
    },
  }
  const resolveC = createLibraryToolExecutor(createCapabilities(store), writer, catalog)
  const templates = await resolveC('library_templates', {})
  check(
    '目录列出模板与组件',
    templates?.content.includes('词条') === true && templates?.content.includes('cover') === true,
    templates?.content,
  )
  check('目录带字段键', templates?.content.includes('学名') === true)
  check(
    '目录列出分类绑定的模板',
    templates?.content.includes('宠物') === true && templates?.content.includes('pet') === true,
  )
  check('没有注入目录时给可读错误', (await resolve('library_templates', {}))?.isError === true)

  // 模板声明过的键：不需要 create_new 试错，读结果里也要列出来
  const declared = await resolveC('library_set_fields', { kind: 'world', id: 3, fields: { 学名: '灰烬藤' } })
  check(
    '模板声明的键不用 create_new 就能写',
    declared?.isError === false && declared?.content.includes('自建字段 学名') === true,
    declared?.content,
  )
  const worldRead = await resolveC('library_read', { kind: 'world', id: 3 })
  check(
    '读结果列出模板字段与未写项',
    worldRead?.content.includes('模板字段（可直接写）：学名') === true &&
      worldRead?.content.includes('未写：学名') === true,
    worldRead?.content,
  )
  const undeclared = await resolveC('library_set_fields', {
    kind: 'world',
    id: 3,
    fields: { 没声明的键: 'x' },
  })
  check(
    '未声明的键仍被拒，并给出模板字段清单',
    undeclared?.isError === true &&
      undeclared?.content.includes('[new-field] 没声明的键') === true &&
      undeclared?.content.includes('模板 / 字段表声明的键') === true,
    undeclared?.content,
  )

  check(
    'toolSummary 认 library_set_tags',
    toolSummary({ id: 'c8', name: 'library_set_tags', args: '{"tags":["主角","观星人"]}' } as never) ===
      '2 个标签',
  )
  check(
    'toolSummary 批量打标签显示条数',
    toolSummary({ id: 'c13', name: 'library_set_tags', args: '{"ids":[1,2,3],"tags":["主角"]}' } as never) ===
      '3 条 · 1 个标签',
  )
  check(
    'toolSummary 认 library_set_media',
    toolSummary({ id: 'c9', name: 'library_set_media', args: '{"slot":"avatar"}' } as never) === 'avatar',
  )
  check(
    'toolSummary 认合并前的 import_image（保留旧记录的可读性）',
    toolSummary({ id: 'c12', name: 'library_import_image', args: '{"slot":"avatar"}' } as never) === '',
  )
  check(
    'toolSummary 认 library_rename',
    toolSummary({ id: 'c10', name: 'library_rename', args: '{"title":"林知遥·改"}' } as never) === '林知遥·改',
  )
  check(
    'toolSummary 认 library_set_placement',
    toolSummary({
      id: 'c11',
      name: 'library_set_placement',
      args: '{"category":"宠物","parentId":3}',
    } as never) === '宠物 · #3',
  )

  // ── 调用方身份 ────────────────────────────────────────────────────────
  check('调用方是助手本人', AGENT_CALLER.actor === 'agent:assistant')
  check('只给只读权限', AGENT_CALLER.permissions === READ_PERMISSION)

  // 权限更高的调用这里够不着（executor 把 caller 写死），所以反向验一次：
  // 能力层对不合法 actor 必须拒绝，避免以后有人把 caller 改成可传入的。
  //
  // 注意 `READ_PERMISSION === 0`：只读是**地板**，任何合法调用方都读得到，
  // 所以 `requireRead` 真正拦的是「actor 不是 human / agent: / plugin:」。
  // 也就是说读权限的闸在**造 Caller 的那一处**，不在这层 —— 见 docs/todo.md。
  const caps = createCapabilities(store)
  let refused = false
  try {
    await caps.listEntities({ actor: 'stranger', permissions: 0 } as unknown as Caller, 'character')
  } catch {
    refused = true
  }
  check('不合法 actor 被能力层拒绝', refused)

  // ── 宿主侧：启用、署名与入口 ──────────────────────────────────────────
  check('助手出厂启用', isPluginActive(AGENT_PLUGIN))
  // 权限是声明，跟着启用状态走（2026-11-06 起设置里不再逐项授权）
  check('助手启用即可读库', hasPermission(AGENT_PLUGIN, 'read-entities') === true)
  check(
    '两个官方插件都署了作者',
    OFFICIAL_PLUGINS.length === 2 && OFFICIAL_PLUGINS.every((plugin) => plugin.author.trim().length > 0),
  )

  const request = { kind: 'character' as const, id: 7, title: '林知遥' }
  const opener = agentContextOpener(request)
  // 输入框里只该有「人话」：kind / id / 工具名都是宿主的事，写进系统提示词
  check('入口开场白是人话（不带 kind / id）', !opener.includes('kind=') && !opener.includes('id=7'))
  check('入口开场白不带工具名', !opener.includes('library_read') && !opener.includes('library_'))
  check('入口开场白点到了标题', opener.includes('林知遥'))
  check('会话标题带书名号', agentContextTitle(request) === '关于《林知遥》')
  check(
    '「和助手聊聊」挂到资料上就算有资料（进系统提示词）',
    hasAgentSessionContext({ ...emptyAgentSessionContext(), focus: { kind: 'character', id: 7 } }) === true,
  )

  // ── 会话资料（扮演 / 创作） ───────────────────────────────────────────
  const emptyContext = emptyAgentSessionContext()
  check('资料默认是空的', hasAgentSessionContext(emptyContext) === false)
  check('选角色后算有资料', hasAgentSessionContext({ ...emptyContext, characterIds: [7] }) === true)
  check('只选小说也算有资料', hasAgentSessionContext({ ...emptyContext, novelRootId: 3 }) === true)
  const novelTool = toolByName('novel_write_chapter')
  check('创作写回工具存在且要审批', novelTool?.category === 'write' && novelTool?.requiresApproval === true)
  check(
    'toolSummary 认 novel_write_chapter',
    toolSummary({ id: 'n1', name: 'novel_write_chapter', args: '{"title":"第一章"}' } as never) === '第一章',
  )

  // ── SSE：正文的几种线格式都要收到（收不到就会只剩思考） ───────────────
  const textEvents = (line: string) =>
    parseSseLine(line)
      .filter((event) => event.type === 'content')
      .map((event) => (event.type === 'content' ? event.text : ''))
      .join('')
  check(
    'delta.content 字符串',
    textEvents('data: {"choices":[{"delta":{"content":"你好"}}]}') === '你好',
  )
  check(
    'delta.content 数组（兼容网关）',
    textEvents('data: {"choices":[{"delta":{"content":[{"type":"text","text":"你好"}]}}]}') === '你好',
  )
  check(
    'delta.text（另一类网关）',
    textEvents('data: {"choices":[{"delta":{"text":"你好"}}]}') === '你好',
  )

  // ── 工具结果预算：回放的是裁剪版，UI 保留全文 ─────────────────────────
  const hugeShell = `${'a'.repeat(3000)}${'b'.repeat(3000)}`
  const clippedShell = clipToolResult('run_shell', hugeShell)
  check(
    'run_shell 保留头尾并给出截断说明',
    clippedShell.startsWith('a') &&
      clippedShell.endsWith('b') &&
      clippedShell.includes('已截断') &&
      clippedShell.length < hugeShell.length,
  )
  check('预算内原样返回', clipToolResult('read_file', 'x'.repeat(100)) === 'x'.repeat(100))
  check(
    'read_file 截断后提示用 offset',
    clipToolResult('read_file', 'x'.repeat(9000)).includes('offset') === true,
  )

  // ── 循环守卫：只读空转 / 同一调用反复失败 ─────────────────────────────
  const readTool = toolByName('library_read')
  const writeTool = toolByName('library_set_fields')
  if (readTool && writeTool) {
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
    const turns: string[][] = [['library_read'], ['library_read'], ['library_read']]
    let turn = 0
    const loop = await runAgentLoop({
      history: [{ role: 'system', content: 'x' }],
      tools: [readTool, writeTool],
      maxSteps: 6,
      signal: new AbortController().signal,
      buildBody: (messages) => {
        bodies.push({ messages: messages as Array<{ role: string; content: string }> })
        return { messages } as never
      },
      stream: async (_body, _signal, onEvent) => {
        const names = turns[turn++]
        if (!names) {
          onEvent({ type: 'content', text: '完成' })
          return
        }
        onEvent({
          type: 'toolCalls',
          deltas: names.map((name, index) => ({
            index,
            id: `c${turn}-${index}`,
            name,
            argumentsDelta: '{}',
          })),
        })
      },
      approve: async () => 'allow',
      execute: async () => ({ content: 'ok', isError: false, durationMs: 0 }),
      onStepStart: () => undefined,
      onDelta: () => undefined,
      onToolUpdate: () => undefined,
    })
    check('只读 3 轮后停下', loop.steps.length === 4 && loop.exhausted === false)
    check(
      '第 4 次请求里带「信息够了」的提醒',
      JSON.stringify(bodies[3]?.messages ?? []).includes('信息够了') === true,
    )

    const retryBodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
    const retryTurns: string[][] = [['library_set_fields'], ['library_set_fields']]
    let retryTurn = 0
    const retry = await runAgentLoop({
      history: [{ role: 'system', content: 'x' }],
      tools: [readTool, writeTool],
      maxSteps: 5,
      signal: new AbortController().signal,
      buildBody: (messages) => {
        retryBodies.push({ messages: messages as Array<{ role: string; content: string }> })
        return { messages } as never
      },
      stream: async (_body, _signal, onEvent) => {
        const names = retryTurns[retryTurn++]
        if (!names) {
          onEvent({ type: 'content', text: '完成' })
          return
        }
        onEvent({
          type: 'toolCalls',
          deltas: names.map((name, index) => ({
            index,
            id: `r${retryTurn}-${index}`,
            name,
            argumentsDelta: '{"kind":"character","id":1,"fields":{}}',
          })),
        })
      },
      approve: async () => 'allow',
      execute: async () => ({ content: '同样的错误', isError: true, durationMs: 0 }),
      onStepStart: () => undefined,
      onDelta: () => undefined,
      onToolUpdate: () => undefined,
    })
    check('同一失败调用重复两次后给出提醒', retry.steps.length === 3)
    check(
      '第 3 次请求里带「失败两次」的提醒',
      JSON.stringify(retryBodies[2]?.messages ?? []).includes('失败两次') === true,
    )

    // 旧工具名（只存在于历史里）也要继承合并后工具的审批属性
    let aliasApproved = 0
    let aliasExecuted = false
    const aliasLoop = await runAgentLoop({
      history: [{ role: 'user', content: '换一张头像' }],
      tools: [writeTool],
      resolveTool: (name) => (name === 'library_import_image' ? writeTool : undefined),
      maxSteps: 1,
      signal: new AbortController().signal,
      buildBody: (messages) => ({ messages }) as never,
      stream: async (_body, _signal, onEvent) => {
        onEvent({
          type: 'toolCalls',
          deltas: [{ index: 0, id: 'alias-1', name: 'library_import_image', argumentsDelta: '{}' }],
        })
      },
      approve: async () => {
        aliasApproved += 1
        return 'deny'
      },
      execute: async () => {
        aliasExecuted = true
        return { content: 'ok', isError: false, durationMs: 0 }
      },
      onStepStart: () => undefined,
      onDelta: () => undefined,
      onToolUpdate: () => undefined,
    })
    check(
      '旧工具名也走审批，不会绕过',
      aliasLoop.steps.length === 1 && aliasApproved === 1 && aliasExecuted === false,
      `approved=${aliasApproved} executed=${aliasExecuted}`,
    )
  }

  // ── 写作手法：只在创作 / 扮演追加，且可逐项关闭 ───────────────────────
  const allSkills = [...DEFAULT_WRITING_SKILLS]
  const creativeSkills = writingSkillsPrompt('CREATIVE', allSkills, 'zh')
  check(
    '创作模式注入四段写作手法',
    creativeSkills.includes('场景') &&
      creativeSkills.includes('对白') &&
      creativeSkills.includes('节奏') &&
      creativeSkills.includes('一致性'),
    creativeSkills.slice(0, 60),
  )
  check(
    '扮演模式不注入「一致性」（会跳出角色）',
    writingSkillsPrompt('ROLEPLAY', allSkills, 'zh').includes('一致性检查') === false,
  )
  check('AGENT 模式不注入写作手法', writingSkillsPrompt('AGENT', allSkills, 'zh') === '')
  check('只开一项时只注入一项', writingSkillsPrompt('CREATIVE', ['dialogue'], 'zh').includes('场景推进') === false)
  const promptCtx = {
    language: 'zh' as const,
    workspacePath: null,
    workspaceName: null,
    toolNames: [],
    platform: 'Windows',
    date: '2026-11-10',
  }
  check(
    'buildSystemPrompt 把人设与写作手法拼在一起',
    buildSystemPrompt('CREATIVE', { ...promptCtx, writingSkills: ['scene'] }).includes('# 写作手法') === true,
  )
  check(
    '设置页的人格预览不带写作手法（避免编辑时重复）',
    editablePrompt('CREATIVE', promptCtx).includes('# 写作手法') === false,
  )

  // ── Gemini：OpenAI 兼容端点 + thought_signature 回放 ───────────────────
  check('Gemini 默认模型是 3.7 Flash', PROVIDERS.GEMINI.defaultModel === 'gemini-3.7-flash')
  check(
    'Gemini 端点拼装正确',
    chatCompletionsUrl(PROVIDERS.GEMINI.defaultBaseUrl) ===
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' &&
      modelsUrl(PROVIDERS.GEMINI.defaultBaseUrl) ===
        'https://generativelanguage.googleapis.com/v1beta/openai/models',
  )
  check(
    'Gemini 的 models/ 前缀会被归一',
    normalizeModelId('GEMINI', 'models/gemini-3.7-flash') === 'gemini-3.7-flash' &&
      normalizeModelId('DEEPSEEK', 'deepseek-flash') === 'deepseek-flash',
  )
  const geminiBody = buildChatRequest({
    provider: 'GEMINI',
    modelId: 'models/gemini-3.7-flash',
    messages: [{ role: 'user', content: 'x' }],
    reasoning: 'high',
    temperature: 1,
    topP: 1,
    maxTokens: null,
  })
  check(
    'Gemini 请求不带 thinking / reasoning_effort',
    geminiBody.model === 'gemini-3.7-flash' &&
      !('thinking' in geminiBody) &&
      !('reasoning_effort' in geminiBody),
    JSON.stringify(geminiBody),
  )

  const geminiLine =
    'data: ' +
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_g',
                type: 'function',
                function: { name: 'ping', arguments: '{"x":1}' },
                extra_content: { google: { thought_signature: 'sig-abc' } },
              },
            ],
          },
        },
      ],
    })
  const geminiEvents = parseSseLine(geminiLine)
  const geminiTool = geminiEvents.find((event) => event.type === 'toolCalls')
  check(
    'SSE 解析保留 Gemini thought_signature',
    geminiTool?.type === 'toolCalls' &&
      JSON.stringify(geminiTool.deltas[0]?.extra ?? {}).includes('sig-abc'),
    JSON.stringify(geminiTool),
  )
  const geminiAcc = new ToolCallAccumulator()
  if (geminiTool?.type === 'toolCalls') geminiAcc.apply(geminiTool.deltas)
  check(
    'ToolCallAccumulator 保留 thought_signature',
    JSON.stringify(geminiAcc.list()).includes('sig-abc') === true,
  )

  if (writeTool) {
    const extraBodies: Array<{ messages: unknown[] }> = []
    let extraTurn = 0
    await runAgentLoop({      history: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'x' },
      ],
      tools: [writeTool],
      maxSteps: 2,
      signal: new AbortController().signal,
      buildBody: (messages) => {
        extraBodies.push({ messages: JSON.parse(JSON.stringify(messages)) as unknown[] })
        return { messages } as never
      },
      stream: async (_body, _signal, onEvent) => {
        if (extraTurn++ === 0) {
          onEvent({
            type: 'toolCalls',
            deltas: [
              {
                index: 0,
                id: 'gem-1',
                name: 'library_set_fields',
                argumentsDelta: '{}',
                extra: { google: { thought_signature: 'sig-loop' } },
              },
            ],
          })
        } else {
          onEvent({ type: 'content', text: '完成' })
        }
      },
      approve: async () => 'allow',
      execute: async () => ({ content: 'ok', isError: false, durationMs: 0 }),
      onStepStart: () => undefined,
      onDelta: () => undefined,
      onToolUpdate: () => undefined,
    })
    check(
      '回放 assistant tool_calls 带 extra_content',
      JSON.stringify(extraBodies[1]?.messages ?? []).includes('thought_signature') === true,
      JSON.stringify(extraBodies[1]?.messages ?? []),
    )

    // 跨轮 / 重启后的历史回放走 messageToOut，这条路径也必须保留签名
    const storedGemini = {
      id: 'm1',
      conversationId: 'c1',
      parentId: '',
      variantIndex: 1,
      active: true,
      role: 'assistant',
      content: '',
      attachments: [],
      reasoning: null,
      steps: [
        {
          index: 0,
          content: '',
          reasoning: '',
          toolCalls: [
            {
              id: 'call_stored',
              name: 'ping',
              args: '{"x":1}',
              status: 'done',
              result: { content: 'pong', isError: false, durationMs: 0 },
              extra: { google: { thought_signature: 'sig-stored' } },
            },
          ],
        },
      ],
      status: 'DONE',
      errorMessage: null,
      model: 'gemini-3.7-flash',
      thinkingMs: null,
      ttftMs: null,
      tps: null,
      tokensIn: null,
      tokensOut: null,
      createdAt: 0,
    } as Message
    check(
      '历史消息回放保留 thought_signature',
      JSON.stringify(messageToOut(storedGemini)).includes('sig-stored') === true,
    )
  }

  console.log(`助手插件自检：${passed} 项断言通过`)
}

void main()
