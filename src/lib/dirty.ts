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
  /** 第一层里与基线不同的键（诊断用：只写日志，不参与任何判断） */
  changedKeys: string[]
  /** 前几个差异的可读描述，形如 `birthday="" → "1990"`（诊断用） */
  diffSummary: string
  markClean: (key?: string) => void
} {
  const key = snapshotKey(snapshot)
  const [savedKey, setSavedKey] = useState(key)

  const markClean = useCallback((next?: string) => {
    setSavedKey(next ?? key)
  }, [key])

  const diff = key === savedKey ? EMPTY_DIFF : diffSnapshot(snapshot, parseKey(savedKey))

  return { dirty: key !== savedKey, changedKeys: diff.keys, diffSummary: diff.summary, markClean }
}

const EMPTY_DIFF: { keys: string[]; summary: string } = { keys: [], summary: '' }

function parseKey(key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(key)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 顶层键的差异（快照都是扁平对象，够用） */
function diffSnapshot(current: unknown, baseline: Record<string, unknown>): { keys: string[]; summary: string } {
  const now = canonical(current) as Record<string, unknown>
  const keys = new Set([...Object.keys(now), ...Object.keys(baseline)])
  const changed: string[] = []
  for (const key of keys) {
    if (JSON.stringify(now[key]) !== JSON.stringify(baseline[key])) changed.push(key)
  }
  changed.sort()
  const summary = changed
    .slice(0, 3)
    .map((key) => `${key}: ${brief(baseline[key])} → ${brief(now[key])}`)
    .join(' | ')
  return { keys: changed, summary }
}

/** 诊断输出用：值太长会看不清，截断即可 */
function brief(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined'
  return text.length > 40 ? `${text.slice(0, 37)}…` : text
}

/**
 * 文档等价比较：**忽略末尾的空段落**。
 *
 * TipTap 的 `TrailingNode`（StarterKit 默认开启）会在挂载后给「以分割线 / 图片 / 表格 /
 * 代码块结尾」的正文补一个可输入的段落 —— 那是编辑器自己的规范化，不是用户改的。
 * 文档末尾的空段落不承载内容，不该被算成「未保存的更改」。
 */
export function sameDocIgnoringTrailingSpacer(a: unknown, b: unknown): boolean {
  return snapshotKey(dropTrailingEmptyParagraphs(a)) === snapshotKey(dropTrailingEmptyParagraphs(b))
}

function dropTrailingEmptyParagraphs(doc: unknown): unknown {
  if (!doc || typeof doc !== 'object') return doc
  const source = doc as { content?: unknown }
  if (!Array.isArray(source.content)) return doc
  const content = [...source.content]
  while (content.length > 0) {
    const last = content[content.length - 1] as { type?: string; content?: unknown[] } | undefined
    const empty = last?.type === 'paragraph' && (!Array.isArray(last.content) || last.content.length === 0)
    if (!empty) break
    content.pop()
  }
  return { ...(doc as Record<string, unknown>), content }
}

/**
 * 诊断：两份文档 JSON 的第一处差异（路径 + 旧/新）。
 * 只用于回答「正文没动，为什么算脏」—— 例如 `doc.content[2].attrs.placeholder: null → "…"`。
 */
export function describeDocDiff(a: unknown, b: unknown, path = 'doc', depth = 0): string {
  if (depth > 10) return `${path}: …`
  if (a === b) return ''
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    return `${path}: ${brief(a)} → ${brief(b)}`
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} → ${b.length}`
    for (let i = 0; i < a.length; i++) {
      const inner = describeDocDiff(a[i], b[i], `${path}[${i}]`, depth + 1)
      if (inner) return inner
    }
    return ''
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const inner = describeDocDiff(left[key], right[key], `${path}.${key}`, depth + 1)
      if (inner) return inner
    }
    return ''
  }
  return `${path}: ${brief(a)} → ${brief(b)}`
}
