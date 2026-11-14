/**
 * 「采用磁盘版本」的确认状态机。
 *
 * UI 只负责渲染 `onChange` 推来的请求并调用 `answer`；取消（false）与确认（true）
 * 都要回到发起方，不能在 toast 里自行吞掉。同一时刻只保留一个请求：新的请求会把
 * 上一个按「取消」结束，避免两个对话框抢同一个 Promise。
 */
export interface ConflictConfirmationRequest {
  paths: string[]
}

export interface ConflictConfirmation {
  /** 打开确认；返回用户是否确认。空路径直接按取消处理 */
  request: (paths: readonly string[]) => Promise<boolean>
  /** 回答当前请求；没有请求时是空操作 */
  answer: (confirmed: boolean) => void
  /** 当前等待确认的请求（给测试 / 调试用） */
  pending: () => ConflictConfirmationRequest | null
}

export function createConflictConfirmation(
  onChange: (request: ConflictConfirmationRequest | null) => void,
): ConflictConfirmation {
  let waiting: { request: ConflictConfirmationRequest; resolve: (confirmed: boolean) => void } | null =
    null

  return {
    request(paths: readonly string[]): Promise<boolean> {
      const unique = [...new Set(paths.map((path) => path.trim()).filter((path) => path !== ''))]
      if (unique.length === 0) return Promise.resolve(false)

      // 上一次还没人回答：按取消结束，保证它的调用方不会悬空
      if (waiting !== null) {
        const previous = waiting
        waiting = null
        previous.resolve(false)
      }

      const request: ConflictConfirmationRequest = { paths: unique }
      const answered = new Promise<boolean>((resolve) => {
        waiting = { request, resolve }
      })
      onChange(request)
      return answered
    },

    answer(confirmed: boolean): void {
      if (waiting === null) return
      const current = waiting
      waiting = null
      onChange(null)
      current.resolve(confirmed)
    },

    pending: () => waiting?.request ?? null,
  }
}
