/**
 * 保存结果契约。
 *
 * 「保存」是异步的：调用方必须能等到它完成，并区分「真的写下去了」和「失败了」。
 * 以前 `requestSave` / `registerSaveHandler` 都是 `void` —— 关窗流程发出请求就往下走，
 * 保存失败也照样关；界面还可能在这时显示「已保存」。这里统一成一个**可等待**的返回值：
 *
 * - `saved`：本次确实提交了一版修订。**不代表编辑器此刻干净** —— await 期间用户又输入
 *   的内容仍是脏的，必须由调用方/自动保存继续提交。
 * - `clean`：没有需要保存的改动（幂等调用，不会产生假回执）。
 * - `none`：当前没有登记保存回调（例如只开了自动保存的笔记视图）。
 * - `failed`：保存失败。调用方必须保留草稿，并且**不能**把它当成保存成功。
 */
export type SaveOutcome =
  | { status: 'saved' }
  | { status: 'clean' }
  | { status: 'none' }
  | { status: 'failed'; error: Error }

export function saveSucceeded(): SaveOutcome {
  return { status: 'saved' }
}

export function saveClean(): SaveOutcome {
  return { status: 'clean' }
}

export function saveNone(): SaveOutcome {
  return { status: 'none' }
}

export function saveFailed(error: unknown): SaveOutcome {
  return { status: 'failed', error: error instanceof Error ? error : new Error(String(error)) }
}
