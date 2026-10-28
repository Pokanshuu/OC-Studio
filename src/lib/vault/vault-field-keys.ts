import type { FieldKind } from '@/lib/fields/types'

// ── 「哪些 frontmatter 键属于自定义字段」的登记处 ────────────────────────
// scan / serialize 是纯函数（离线体检脚本也会直接调），不能让它们 import 字段表
// （那边挂着 Dexie 与 React）。装载前由 vault-load 把当前配置里的自定义键登记进来，
// 这里只存一张 纯数据 表。
//
// 语义：**没登记的自定义键 = 不再是字段** —— 扫描不读它、写回不动它，
// 于是「删掉字段 → 数据仍留在文件里 → 加回来还能读」成立。

const registry = new Map<FieldKind, string[]>()

export function setCustomFieldKeys(kinds: Partial<Record<FieldKind, string[]>>): void {
  registry.clear()
  for (const [kind, keys] of Object.entries(kinds)) {
    if (Array.isArray(keys) && keys.length > 0) registry.set(kind as FieldKind, keys)
  }
}

export function customFieldKeys(kind: FieldKind): string[] {
  return registry.get(kind) ?? []
}

export function resetCustomFieldKeys(): void {
  registry.clear()
}
