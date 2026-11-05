/**
 * 宿主侧接线：把能力层的执行器交给插件。
 *
 * 这里**故意用动态 import**：`createDexieCapabilityStore()` 会拉起 Dexie，而
 * Next 在构建期也会 import 这个模块 —— 顶层的 Dexie 在 Node 里没有 IndexedDB，
 * 会当场炸。改成用到时才装载，构建期与 SSR 都不会碰它。
 *
 * 插件那边只认 `(name, args)` 这个签名，不知道背后是 Dexie、是 MCP 还是别的
 * （`docs/Agent接入.md` §传输层）。换实现只改这一个文件。
 */
import { createLibraryToolExecutor, LIBRARY_TOOL_NAMES, type LibraryWriter } from '@/lib/capabilities/agent-tools'
import type { EntityKind } from '@/lib/capabilities/types'
import { hasPermission, isPluginActive } from '@/lib/plugins'
import { AGENT_PLUGIN } from '@/lib/plugins/official'

type Executor = ReturnType<typeof createLibraryToolExecutor>

/**
 * 读实体是**逐项授权**（默认关）。没开时：
 * - `isLibraryTool` 让调用方把这些工具从本轮请求里摘掉（模型看不到 = 不会去调）
 * - `resolveLibraryTool` 仍然兜底回一句可读错误（万一历史上已经把工具名发出去）
 *
 * 闸放在宿主这一侧，而不是插件设置里 —— 插件自带的工具开关是“我想让它用哪些”，
 * 宿主的授权是“它能不能看见库”，两者不能互相顶替。
 */
export function libraryAccessGranted(): boolean {
  return isPluginActive(AGENT_PLUGIN) && hasPermission(AGENT_PLUGIN, 'read-entities')
}

export function isLibraryTool(name: string): boolean {
  return (LIBRARY_TOOL_NAMES as readonly string[]).includes(name)
}

const TABLE_BY_KIND: Record<EntityKind, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  world: 'worldEntries',
}

/**
 * 写库的落点：直接对 Dexie 表 `update`。
 *
 * 不去找 service 层是因为**不该绕过落盘链路，而 Dexie 就是那条链路本身** ——
 * `vault-persist` 挂在 dbcore 中间件上，任何写都会进队列、序列化成 frontmatter、
 * 走原子写，并在 flush 成功时追加一条带 `actor` 的时间线。所以这里只要两件事做对：
 *   1. 包在 `runAsActorAsync('agent:assistant', …)` 里（时间线才认得出是谁）
 *   2. 顺带把 `updatedAt` 推一下（列表按它排序）
 */
const writer: LibraryWriter = {
  async setFields(kind, id, patch) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    await runAsActorAsync('agent:assistant', async () => {
      await db.table(TABLE_BY_KIND[kind]).update(id, { ...patch, updatedAt: Date.now() })
    })
  },
  async setBody(kind, id, markdown) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const { bodyDocFromMarkdown } = await import('@/lib/vault/write-body')
    const { worldBodyPatch } = await import('@/lib/world-body')
    // 正文只写 `document`（`lib/world-body.ts`）—— 词条也一样。
    // 以前这里对词条写 `content: JSON.stringify(doc)`，等于把刚收敛掉的两份真源
    // 又装回来一份；`npm run audit:world` 里有断言钉着这条。
    const patch = worldBodyPatch(bodyDocFromMarkdown(markdown))
    await runAsActorAsync('agent:assistant', async () => {
      await db.table(TABLE_BY_KIND[kind]).update(id, { ...patch, updatedAt: Date.now() })
    })
  },
  async create(kind, input) {
    const { runAsActorAsync } = await loadWriteDeps()
    const [defaults, characters, events, countries, world] = await Promise.all([
      import('@/lib/entity-defaults'),
      import('@/features/characters/services'),
      import('@/features/events/services'),
      import('@/features/countries/services'),
      import('@/features/world/services'),
    ])
    // 走各 feature 的 `create*`，不要在这里手拼一行塞进 Dexie ——
    // 那条路会漏掉操作日志与索引维护（见 `LibraryWriter.create` 的注释）。
    return runAsActorAsync('agent:assistant', async () => {
      if (kind === 'character') {
        return characters.createCharacter({ ...defaults.newCharacterData(), name: input.title, ...input.fields })
      }
      if (kind === 'event') {
        return events.createEvent({ ...defaults.newEventData(), title: input.title, ...input.fields })
      }
      if (kind === 'country') {
        return countries.createCountry({ ...defaults.newCountryData(), name: input.title, ...input.fields })
      }
      return world.createEntry({ ...defaults.newWorldEntryData(), title: input.title, ...input.fields })
    })
  },
  async link(from, to, relation, toName) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const now = Date.now()
    return runAsActorAsync('agent:assistant', async () => {
      if (from.kind === 'character' && to.kind === 'character') {
        const row = await db.characters.get(from.id)
        if (!row) return { changed: false }
        const list = row.relatedCharacters ?? []
        if (list.some((item) => item.characterId === to.id)) return { changed: false }
        await db.characters.update(from.id, {
          relatedCharacters: [...list, { characterId: to.id, name: toName, relation }],
          updatedAt: now,
        })
        return { changed: true }
      }
      if (from.kind === 'character' && to.kind === 'country') {
        const row = await db.characters.get(from.id)
        if (!row || row.countryId === to.id) return { changed: false }
        // 国籍只有这一个真源；国家页的名单是查询，不写
        await db.characters.update(from.id, { countryId: to.id, updatedAt: now })
        return { changed: true }
      }
      if (from.kind === 'event' && (to.kind === 'character' || to.kind === 'country')) {
        const row = await db.events.get(from.id)
        if (!row) return { changed: false }
        if (to.kind === 'character') {
          const list = row.characters ?? []
          if (list.includes(to.id)) return { changed: false }
          await db.events.update(from.id, { characters: [...list, to.id], updatedAt: now })
          return { changed: true }
        }
        const list = row.countries ?? []
        if (list.includes(to.id)) return { changed: false }
        await db.events.update(from.id, { countries: [...list, to.id], updatedAt: now })
        return { changed: true }
      }
      return { changed: false }
    })
  },
}

/** 写到一半才装载 Dexie，构建期与 SSR 都不会碰它 */
async function loadWriteDeps(): Promise<{
  db: typeof import('@/lib/db').db
  runAsActorAsync: typeof import('@/lib/vault/actor').runAsActorAsync
}> {
  const [{ db }, { runAsActorAsync }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/vault/actor'),
  ])
  return { db, runAsActorAsync }
}

let executor: Executor | null = null
let loading: Promise<Executor> | null = null

async function loadExecutor(): Promise<Executor> {
  if (executor) return executor
  loading ??= (async () => {
    const [{ createCapabilities }, { createDexieCapabilityStore }] = await Promise.all([
      import('@/lib/capabilities'),
      import('@/lib/capabilities/dexie-store'),
    ])
    executor = createLibraryToolExecutor(createCapabilities(createDexieCapabilityStore()), writer)
    return executor
  })()
  return loading
}

/** 归宿主管的工具返回结果；不归它管返回 `null`，调用方继续走插件自己的路径 */
export async function resolveLibraryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean; data?: unknown; durationMs: number } | null> {
  if (isLibraryTool(name) && !libraryAccessGranted()) {
    return {
      content: '作者没有开启「读实体」权限，这个环境看不到设定库。可以在 设置 › 插件 › 助手 里打开。',
      isError: true,
      durationMs: 0,
    }
  }
  const run = await loadExecutor()
  return run(name, args)
}
