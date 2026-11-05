/**
 * 助手插件自检：`npx tsx scripts/agent-plugin-check.ts`（`npm run audit:agent`）
 *
 * 验的是**接缝**，不是插件本身（插件原样搬自 Simple-Agent，它有自己的测试）：
 * - 四个设定库工具的 schema 真的进了 `ALL_TOOLS`（提示词靠它，漏了就白搭）
 * - 执行器把名字翻成能力层的调用，参数按不可信输入校验
 * - 不归宿主管的名字必须回 `null`，让插件继续走自己的文件工具
 * - 调用方身份是 `agent:assistant` + 只读权限（写入一律不放）
 *
 * 用内存 store，不碰 Dexie / 文件系统。
 */
import { createCapabilities } from '../src/lib/capabilities'
import { AGENT_CALLER, LIBRARY_TOOL_NAMES, createLibraryToolExecutor } from '../src/lib/capabilities/agent-tools'
import { READ_PERMISSION, type Caller, type CapabilityStore, type EntityKind } from '../src/lib/capabilities/types'
import { ALL_TOOLS, toOpenAiTools, toolByName, toolSummary } from '../src/plugins/agent/core/agent/tools'
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
  character({ id: 8, name: '沈砚', bio: '话少。', updatedAt: 100 }),
]

const tags: Tag[] = [{ id: 1, name: '主角', category: '', color: 'stone' }]

/**
 * 内存 store。`CapabilityStore` 的三个方法是**泛型**的（按 kind 收窄返回类型），
 * 内存实现没法逐分支表达这一点，所以先按宽类型写、再收成契约类型。
 */
const store = {
  async list(kind: EntityKind): Promise<Array<Character | Event | Country | WorldEntry>> {
    if (kind === 'character') return characters
    return []
  },
  async get(kind: EntityKind, id: number): Promise<Character | Event | Country | WorldEntry | null> {
    if (kind !== 'character') return null
    return characters.find((item) => item.id === id) ?? null
  },
  async tags(): Promise<Tag[]> {
    return tags
  },
} as unknown as CapabilityStore

const resolve = createLibraryToolExecutor(createCapabilities(store))

async function main(): Promise<void> {
  // ── schema 进了提示词面 ────────────────────────────────────────────────
  for (const name of LIBRARY_TOOL_NAMES) {
    const spec = toolByName(name)
    check(`schema 存在：${name}`, Boolean(spec))
    const readOnly = spec?.name !== 'library_set_fields'
    check(
      `${name} ${readOnly ? '只读免审批' : '写入要审批'}`,
      spec?.category === (readOnly ? 'read' : 'write') && spec?.requiresApproval === !readOnly,
    )
  }

  const openAi = toOpenAiTools(ALL_TOOLS).map((tool) => {
    const fn = (tool as { function?: { name?: string } }).function
    return fn?.name ?? ''
  })
  check('OpenAI tools 里带着这四个', LIBRARY_TOOL_NAMES.every((name) => openAi.includes(name)))
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

  // ── library_read ──────────────────────────────────────────────────────
  const read = await resolve('library_read', { kind: 'character', id: 7 })
  check('读到正文装配成 markdown', read?.content.startsWith('# 林知遥（角色）') === true, read?.content.slice(0, 40))
  check('字段进了切片', read?.content.includes('测绘师') === true)
  check('关系进了切片', read?.content.includes('沈砚（同门）') === true)

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
  check('没命中也给一句话', noHit?.content === '没有匹配「不存在的名字」的条目。')

  // ── library_graph ─────────────────────────────────────────────────────
  const graph = await resolve('library_graph', { kind: 'character', id: 7, hops: 1 })
  check('关系图带出邻居', graph?.content.includes('沈砚') === true)
  check('关系图里含中心条目', graph?.content.includes('# 林知遥') === true)

  // ── library_set_fields（写）────────────────────────────────────────────
  const noWriter = await resolve('library_set_fields', { kind: 'character', id: 7, fields: { race: '精灵' } })
  check('没注入 writer 时写不了', noWriter?.isError === true && noWriter?.content === '这个环境不能写库。')

  const writes: Array<{ kind: string; id: number; patch: Record<string, string> }> = []
  const writer = {
    async setFields(kind: EntityKind, id: number, patch: Record<string, string>) {
      writes.push({ kind, id, patch })
      const row = characters.find((item) => item.id === id)
      if (row) Object.assign(row, patch)
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

  const mixed = await resolveW('library_set_fields', {
    kind: 'character',
    id: 8,
    fields: { bio: '剑客。', name: '改名' },
  })
  check('白名单外的键被挡下但仍写其余', mixed?.isError === false && mixed?.content.includes('已写入 bio') === true, mixed?.content.slice(0, 50))
  check('被挡的键要点出来', JSON.stringify(mixed?.data).includes('name') === true)

  const onlyRejected = await resolveW('library_set_fields', {
    kind: 'character',
    id: 8,
    fields: { name: '改名' },
  })
  check('全是非法键时明确报错', onlyRejected?.isError === true && onlyRejected?.content.includes('不能写') === true)
  check('全非法时不会真去写', writes.length === 2)

  const worldWrite = await resolveW('library_set_fields', { kind: 'world', id: 1, fields: { title: 'x' } })
  check('词条没有可写标量', worldWrite?.isError === true && worldWrite?.content.includes('没有可写') === true)

  const emptyFields = await resolveW('library_set_fields', { kind: 'character', id: 7, fields: {} })
  check('空 fields 报错', emptyFields?.isError === true)

  const badFields = await resolveW('library_set_fields', { kind: 'character', id: 7, fields: 'x' })
  check('fields 不是对象时报错', badFields?.isError === true)

  const longValue = 'x'.repeat(5000)
  await resolveW('library_set_fields', { kind: 'character', id: 7, fields: { bio: longValue } })
  const lastPatch = writes[writes.length - 1]?.patch ?? {}
  check('超长值被截断', (lastPatch.bio ?? '').length === 4000)

  check(
    'toolSummary 认 library_set_fields',
    toolSummary({ id: 'c3', name: 'library_set_fields', args: '{"fields":{"race":"精灵"}}' } as never) === 'race',
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

  console.log(`助手插件自检：${passed} 项断言通过`)
}

void main()
