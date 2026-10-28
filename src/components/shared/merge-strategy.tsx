'use client'

import type { MergeStrategy } from '@/lib/import'

// ── 合并策略选项（唯一源） ───────────────────────────────────────────────
// 两处用到它：
//   1. 导入 `.ocbak` 时的确认对话框（先合并进 Dexie）
//   2. 落地到一个**已有笔记**的文件夹时（按同名合并进文件）
// 语义在两边刻意保持一致，用户不需要学两套说法。

export interface MergeOption {
  value: MergeStrategy
  label: string
  description: string
}

export const MERGE_OPTIONS: MergeOption[] = [
  { value: 'skip', label: '跳过重复', description: '仅添加不重名的数据，已有记录保持不变' },
  { value: 'overwrite', label: '覆盖重复', description: '用导入数据替换本地同名记录' },
  { value: 'keep-both', label: '保留两者', description: '导入数据作为新条目，生成新 ID' },
  { value: 'replace', label: '清空并导入', description: '清除所有数据后导入，等同于覆盖替换' },
]

export function MergeStrategyPicker({
  value,
  onChange,
  label = '重复记录处理策略',
}: {
  value: MergeStrategy
  onChange: (value: MergeStrategy) => void
  label?: string
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {MERGE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${
            value === opt.value ? 'border-line-hover bg-paper-card' : 'border-line hover:border-line-hover'
          }`}
        >
          <input
            type="radio"
            name="merge-strategy"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 h-4 w-4 shrink-0 border-line bg-paper-card text-ink accent-ink"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-ink">{opt.label}</span>
            <span className="text-[11px] text-ink-faint">{opt.description}</span>
            {opt.value === 'keep-both' && value === 'keep-both' ? (
              <span className="pt-0.5 text-[11px] text-error">
                注意：关联关系（如 relatedCharacters）可能需要手动修复
              </span>
            ) : null}
          </div>
        </label>
      ))}
    </div>
  )
}
