'use client'

import { useCallback, useState } from 'react'

/**
 * 脏标记的唯一口径：把表单**当前值**压成一段稳定签名，与**已保存值**的签名逐字比对。
 *
 * 为什么不是「谁改了谁喊一声」：通知只能说明发生过某个动作，说明不了数据真的变了。
 * 于是这些情况全会留下一个再也抹不掉的 dirty，下次返回就弹「有未保存的更改」——
 * 而用户看到的内容和保存时一模一样：
 *   · 输入一个字符又删掉 / Ctrl+Z 撤销回原样
 *   · 保存后值被规范化（时间 `3` → `03`、别名 `a,b` → `a、b`），回灌时状态变了一下
 *   · 外部数据刷新、编辑器挂载期的程序化同步
 * 按数据比对时，以上都天然是「干净」。
 */
export function snapshotKey(value: unknown): string {
  return JSON.stringify(canonical(value))
}

/** 键排序 + 丢掉 undefined：同一份数据无论对象字面量怎么写，签名都相同 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      const item = source[key]
      if (item === undefined) continue
      out[key] = canonical(item)
    }
    return out
  }
  return value
}

/**
 * 由当前快照派生 dirty。
 *
 * - 基线初值 = 挂载那一刻的快照（装载后的表单就是「已保存」状态）
 * - 保存成功后 `markClean()` 把当前快照记为基线（不传参）
 * - 外部数据回灌时 `markClean(签名)` 显式对齐 —— 回灌本身不是用户的改动
 */
export function useDirtySnapshot(snapshot: unknown): {
  dirty: boolean
  markClean: (key?: string) => void
} {
  const key = snapshotKey(snapshot)
  const [savedKey, setSavedKey] = useState(key)

  const markClean = useCallback((next?: string) => {
    setSavedKey(next ?? key)
  }, [key])

  return { dirty: key !== savedKey, markClean }
}
