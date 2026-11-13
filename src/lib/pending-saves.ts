/**
 * 「关窗前把还没落盘的东西交出来」的登记处。
 *
 * 各处的自动保存都有自己的防抖计时器（词条正文 2s、表单 1.5s），关窗时这些
 * 计时器可能还没到点。`beforeunload` 拦不住异步写盘，Tauri 的 close 事件
 * 倒是可以先 `preventDefault()`、`await` 完再关 —— 但那个事件不知道谁手里还有草稿。
 *
 * 所以让草稿自己登记一个 flush 函数：关窗流程统一 `await flushPendingSaves()`。
 * 只登记「当前页面上真的可能有未保存内容」的东西，不要把所有保存都塞进来。
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

/** 把当前页面登记的所有草稿都刷出去（失败不阻断其它 flush） */
export async function flushPendingSaves(): Promise<void> {
  const list = [...flushers]
  await Promise.allSettled(list.map((fn) => fn()))
}
