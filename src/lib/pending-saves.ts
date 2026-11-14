/**
 * 「关窗前把还没落盘的东西交出来」的登记处。
 *
 * 各处的自动保存都有自己的防抖计时器（词条正文 2s、表单 1.5s），关窗时这些
 * 计时器可能还没到点。`beforeunload` 拦不住异步写盘，Tauri 的 close 事件
 * 倒是可以先 `preventDefault()`、`await` 完再关 —— 但那个事件不知道谁手里还有草稿。
 *
 * 所以让草稿自己登记一个 flush 函数：关窗 / 换库流程统一 `await flushPendingSaves()`。
 * 只登记「当前页面上真的可能有未保存内容」的东西，不要把所有保存都塞进来。
 *
 * 契约（R17）：**只有全部 flush 成功才能 resolve**。失败要全部收集后抛出来，
 * 不能把拒绝吞掉 —— 否则关窗流程会以为已经写完了。
 */

type Flusher = () => void | Promise<void>

const flushers = new Set<Flusher>()

/** 登记一个 flush；返回注销函数（组件卸载时调用） */
export function registerPendingSave(fn: Flusher): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

/** 汇总失败：保留每一条的原始文案，调用方可直接展示 */
export class PendingSaveError extends Error {
  readonly failures: string[]

  constructor(failures: string[]) {
    super(`有 ${failures.length} 处草稿没能保存：${failures.join('；')}`)
    this.name = 'PendingSaveError'
    this.failures = failures
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 同一时刻只跑一轮：关窗与换库可能同时触发（例如用户在关窗动画里点了「打开」），
 * 重复跑会让同一份草稿被提交两次。这里复用进行中的那一轮；失败后自动清空，
 * 重试可以再跑。
 */
let inFlight: Promise<void> | null = null

/** 把当前页面登记的所有草稿都刷出去（失败不阻断其它 flush，最后统一抛错） */
export function flushPendingSaves(): Promise<void> {
  if (inFlight !== null) return inFlight

  const batch = [...flushers]
  const run = (async () => {
    const results = await Promise.allSettled(
      batch.map((fn) => Promise.resolve().then(fn)),
    )
    const failures: string[] = []
    for (const result of results) {
      if (result.status === 'rejected') failures.push(errorText(result.reason))
    }
    if (failures.length > 0) throw new PendingSaveError(failures)
  })()

  inFlight = run
  const clear = () => {
    if (inFlight === run) inFlight = null
  }
  run.then(clear, clear)
  return run
}
