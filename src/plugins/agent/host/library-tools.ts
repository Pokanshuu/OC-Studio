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
import { createLibraryToolExecutor, type LibraryWriter } from '@/lib/capabilities/agent-tools'
import type { EntityKind } from '@/lib/capabilities/types'

type Executor = ReturnType<typeof createLibraryToolExecutor>

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
    const doc = bodyDocFromMarkdown(markdown)
    // 词条的正文在 `content`（JSON 字符串），其余在 `document`（对象）——
    // 这条口径由 `markdown-bridge.ts` 定，写入侧照抄，不另立一套。
    const patch = kind === 'world' ? { content: JSON.stringify(doc) } : { document: doc }
    await runAsActorAsync('agent:assistant', async () => {
      await db.table(TABLE_BY_KIND[kind]).update(id, { ...patch, updatedAt: Date.now() })
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
  const run = await loadExecutor()
  return run(name, args)
}
