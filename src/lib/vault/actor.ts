/**
 * 「这次改动是谁做的」—— `journal.jsonl` 的 `actor` 字段唯一来源
 * （`docs/Agent接入.md` §2.2）。
 *
 * 身份必须跟着**具体写入**走，不能跟着「当前这段异步代码」走：
 * 用户的人工自动保存可能正好发生在助手一次 `await` 期间，模块级栈会把人工
 * 写入记成 `agent:…`（审查 R16）。所以：
 *
 * - `runAsActor` / `currentActor` 只覆盖**同步**调用，供脚本、同步写入和
 *   「入队那一刻」使用；它不跨 await，也就不可能把身份借给别的异步调用。
 * - 异步写入用 `runAsActorTransaction`：Dexie 事务对象上绑定身份，
 *   `vault-persist` 在中间件里按当前事务（含嵌套事务的 parent 链）取 actor。
 *   人工写入不在该事务里，始终是 `human`；两个事务交错也不会串。
 * - 失败重试 / 标签引用回写由 `vault-persist` 把 actor 存进 `PendingWrite`，
 *   不会在稍后的 flush 里重新猜身份。
 */
import type { JournalActor } from './journal'

/** 同步作用域栈：只在同步调用期间有效，`await` 之后必须已经出栈 */
const syncActors: JournalActor[] = []

/** 当前同步身份；栈空 = 用户本人 */
export function currentActor(): JournalActor {
  return syncActors.length > 0 ? syncActors[syncActors.length - 1] : 'human'
}

/** 同步作用域。**不要**在回调里 `await` 别的操作后再指望身份还在。 */
export function runAsActor<T>(actor: JournalActor, run: () => T): T {
  syncActors.push(actor)
  try {
    return run()
  } finally {
    syncActors.pop()
  }
}

/**
 * 兼容旧调用点的名字：**不再跨 await 保留身份**。
 *
 * 保留它只为两种场景：旧脚本 / 只读回调，以及「外层已经用
 * `runAsActorTransaction` 绑好事务」的调用。生产写库一律走事务版本，
 * 不要在它里面依赖 `currentActor()` 认助手。
 *
 * @deprecated 用 `runAsActorTransaction`；不要用它包住会写库的异步操作。
 */
export function runAsActorAsync<T>(actor: JournalActor, run: () => Promise<T>): Promise<T> {
  void actor
  return run()
}

interface TransactionLike {
  parent?: TransactionLike | null
}

/**
 * 事务 → 身份。用 `WeakMap` 而不是挂在事务对象上：Dexie 的事务对象是内部
 * 结构，不往上面加字段；事务结束被 GC 后映射也一起消失。
 */
const transactionActors = new WeakMap<object, JournalActor>()

/** 给一个事务（通常是 Dexie 的 `Transaction`）绑定身份；测试可传普通对象 */
export function bindActorToTransaction(transaction: object | null | undefined, actor: JournalActor): void {
  // 测试里的假 db 可能不传事务对象；没有对象就没有可绑定的作用域，安全跳过。
  if (transaction === null || typeof transaction !== 'object') return
  transactionActors.set(transaction, actor)
}

/**
 * 当前事务的身份：子事务没绑定时沿 `parent` 链往上找。
 *
 * Dexie 的嵌套事务会新建子事务对象、把 `parent` 指向外层；只查当前对象会
 * 漏掉外层身份。事务外 / 没绑定 / 人工写入都回落到 `human`。
 */
export function actorOfTransaction(transaction: unknown): JournalActor {
  let node = transaction as TransactionLike | null | undefined
  const visited = new Set<object>()
  while (node !== null && typeof node === 'object') {
    if (visited.has(node)) break
    visited.add(node)
    const actor = transactionActors.get(node)
    if (actor !== undefined) return actor
    node = node.parent ?? null
  }
  return 'human'
}

/**
 * 把一段**只做 Dexie 写入**的异步操作包进事务，并把身份绑在这个事务上。
 *
 * 约束：回调里不要 `await` 网络 / 文件 / localStorage 等非 Dexie 操作 ——
 * IndexedDB 事务在让出事件循环时会自动提交，之后再写会抛
 * `Transaction committed too early`。需要先读模板 / 下载图片的，把那些
 * 准备工作放在外面（`library-tools.ts` 就是这么接的）。
 */
export async function runAsActorTransaction<T>(
  actor: JournalActor,
  run: () => Promise<T>,
): Promise<T> {
  const { db } = await import('@/lib/db')
  return db.transaction('rw', db.tables, async (transaction) => {
    bindActorToTransaction(transaction, actor)
    try {
      return await run()
    } finally {
      transactionActors.delete(transaction)
    }
  }) as Promise<T>
}

/** 只读观察用（创作时间线按身份过滤 / 上色） */
export function isAgentActor(actor: JournalActor): boolean {
  return actor.startsWith('agent:') || actor.startsWith('plugin:')
}

/**
 * 把**一次具体的 Dexie 写入**包进事务并绑定身份。
 *
 * 新建实体的 service 会先读模板 / 正文骨架（文件 IPC），这些准备必须在事务外；
 * 只有真正的 `db.add` 走这里。人工路径（`actor` 缺省 / `'human'`）完全保持原样，
 * 不开事务，也不影响并发的人工自动保存（Q07）。
 */
export async function writeAsActor<T>(
  actor: JournalActor | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (actor === undefined || actor === 'human') return run()
  return runAsActorTransaction(actor, run)
}
