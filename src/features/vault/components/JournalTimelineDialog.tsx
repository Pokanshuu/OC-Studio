'use client'

/**
 * 创作时间线（全库）：`docs/todo.md` §2「世界级汇总时间线」。
 *
 * 和「时间线」分区不是一回事：那个是**世界内**的事件轴，这个是**文件真的被改过**
 * 的审计流（`.ocstudio/journal.jsonl`，只追加、不存正文）。仓库模式下才有数据；
 * 这里只读，不提供回滚 / diff。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatTimestamp,
  journalKindLabel,
  readJournal,
  type JournalEntry,
} from '@/lib/vault/journal'
import { getVaultSession } from '@/lib/vault/vault-session'
import { BTN_QUIET, PAGE_TITLE } from '@/lib/ui-tokens'

interface JournalTimelineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function actorLabel(actor: JournalEntry['actor']): string {
  if (actor === 'human') return ''
  // 界面上不出现英文代码名：`agent:assistant` 就是「助手」（`AGENTS.md` 约束 15）
  if (actor === 'agent:assistant') return '助手'
  if (actor.startsWith('agent:')) return `助手 · ${actor.slice(6)}`
  return `插件 · ${actor.slice(7)}`
}

export function JournalTimelineDialog({ open, onOpenChange }: JournalTimelineDialogProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await readJournal())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let alive = true
    void readJournal()
      .then((next) => {
        if (alive) setEntries(next)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open])

  /** 按本地日期分组；`readJournal` 已经是新的在前，分组不重排 */
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: JournalEntry[] }> = []
    for (const entry of entries) {
      const stamp = formatTimestamp(entry.ts)
      const day = stamp.slice(0, 10)
      const group = out[out.length - 1]
      if (group && group.day === day) group.items.push(entry)
      else out.push({ day, items: [entry] })
    }
    return out
  }, [entries])

  const session = typeof window === 'undefined' ? null : getVaultSession()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col overflow-hidden"
        style={{
          width: 'min(720px, calc(100vw - 2rem))',
          maxWidth: 'min(720px, calc(100vw - 2rem))',
          height: 'min(640px, calc(100vh - 2rem))',
        }}
      >
        <DialogHeader>
          <DialogTitle className={PAGE_TITLE}>创作时间线</DialogTitle>
          <DialogDescription className="text-[12px] text-ink-faint">
            {loading ? '读取中…' : `${entries.length} 条记录`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 py-10 text-[13px] text-ink-muted">
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              读取中…
            </div>
          ) : session === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
              <span className="text-[13px] text-ink-muted">仓库模式下才有记录</span>
              <span className="text-[12px] text-ink-faint">打开本地文件夹后，保存动作会记在这里</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
              <span className="text-[13px] text-ink-muted">还没有记录</span>
              <span className="text-[12px] text-ink-faint">保存任意一篇笔记后开始记录</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <section key={group.day}>
                  <h3 className="mb-1 text-[11px] tracking-[0.06em] text-ink-faint">{group.day}</h3>
                  <ul className="flex flex-col rules-end">
                    {group.items.map((entry) => {
                      const time = formatTimestamp(entry.ts).slice(11)
                      const actor = actorLabel(entry.actor)
                      return (
                        <li
                          key={`${entry.ts}-${entry.kind}-${entry.hash}-${entry.relPath}`}
                          className="row-rule flex items-baseline gap-3 py-2 text-[13px]"
                        >
                          <span className="w-[42px] shrink-0 tabular-nums text-ink-muted">{time}</span>
                          <span className="w-[84px] shrink-0 text-ink">{journalKindLabel(entry.kind)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-ink">{entry.title || entry.relPath}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                              {entry.relPath}
                              {actor !== '' ? ` · ${actor}` : ''}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2">
          <button type="button" className={BTN_QUIET} onClick={() => void load()} disabled={loading || session === null}>
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
          <button type="button" className={BTN_QUIET} onClick={() => onOpenChange(false)}>
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
