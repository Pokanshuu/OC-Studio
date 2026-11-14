'use client'

import { sameDocNodeIgnoringTrailingSpacer } from '@/lib/dirty'

/**
 * 「保存开始时的那一版」和「现在编辑器里的这一版」是否已经不同。
 *
 * 保存的 await 期间用户仍可以输入：**成功回执只能确认被提交的那一版**。
 * 因此保存成功后要做两件事，而不是把 `editor.state.doc` 直接记成基线：
 *   1. 基线 = 提交时捕获的不可变文档节点（`submitted`）；
 *   2. 用本函数比较当前文档与 `submitted`，仍然不同就保持 dirty。
 *
 * 末尾空段落的判定复用 `lib/dirty.ts` 的唯一口径（TrailingNode 补的可输入段落不算改动），
 * 否则「保存后什么都没改」也会一直显示未保存。
 */
export function docRevisionChanged(current: unknown, submitted: unknown): boolean {
  return !sameDocNodeIgnoringTrailingSpacer(current, submitted)
}
