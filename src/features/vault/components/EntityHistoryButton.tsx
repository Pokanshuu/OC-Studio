'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { downloadJson } from '@/lib/export'
import { BTN_PRIMARY, BTN_QUIET, ICON_BTN_MD, PAGE_TITLE } from '@/lib/ui-tokens'
import { getVaultSession, entityKey, type VaultTableName } from '@/lib/vault/vault-session'
import {
  formatTimestamp,
  journalKindLabel,
  journalOf,
  buildJournalExport,
  readJournal,
  type JournalEntry,
} from '@/lib/vault/journal'

// ── 实体页头的「历史」 ───────────────────────────────────────────────────
// 只读列表 + 导出 JSON。数据来自 `.ocstudio/journal.jsonl`（保存时由落盘队列追加）。
// 不在仓库模式（浏览器 Mock / 没绑定文件夹）时整个按钮不渲染 —— 没有文件夹就没有日志。

interface EntityHistoryButtonProps {
  table: VaultTableName
  id: number
  /** 标题里显示的名字；缺省用日志里记的 title */
  name?: string
}

export function EntityHistoryButton({ table, id, name }: EntityHistoryButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [relPath, setRelPath] = useState<string | null>(null)

  // 仓库模式才有日志；没绑定文件夹时完全不显示这个入口
  const session = getVaultSession()
  const currentPath = session === null ? null : (session.entries.get(entityKey(table, id))?.relPath ?? null)
  const available = currentPath !== null && currentPath !== ''

  const load = useCallback(async () => {
    if (currentPath === null) return
    setLoading(true)
    try {
      const all = await readJournal()
      setEntries(journalOf(all, currentPath))
      setRelPath(currentPath)
    } finally {
      setLoading(false)
    }
  }, [currentPath])

  useEffect(() => {
    if (!open) return
    // 打开浮层时才读时间线；load 内部负责 loading/entries，这是外部数据订阅而非派生 state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [open, load])

  const title = name !== undefined && name.trim() !== '' ? name : '这篇笔记'

  const handleExport = useCallback(async () => {
    try {
      const payload = buildJournalExport(entries, { relPath: relPath ?? '', title })
      const stamp = new Date().toISOString().slice(0, 10)
      const saved = await downloadJson(payload, `时间线-${title}-${stamp}.json`)
      toast.success(`已导出：${saved}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message !== '已取消') toast.error('导出失败')
    }
  }, [entries, relPath, title])

  if (!available) return null

  return (
    <>
      <button
        type="button"
        className={ICON_BTN_MD}
        title="历史"
        aria-label="历史"
        onClick={() => setOpen(true)}
      >
        <History size={16} strokeWidth={2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={PAGE_TITLE}>历史</DialogTitle>
            <DialogDescription className="text-[12px] text-ink-faint">
              {relPath ?? currentPath}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] min-h-[120px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-ink-muted">
                <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                读取中…
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-center">
                <span className="text-[13px] text-ink-muted">还没有记录</span>
                <span className="text-[12px] text-ink-faint">保存一次之后开始记录</span>
              </div>
            ) : (
              <ul className="flex flex-col rules-end">
                {entries.map((entry) => (
                  <li
                    key={`${entry.ts}-${entry.kind}-${entry.hash}`}
                    className="row-rule flex items-baseline gap-3 py-2 text-[13px]"
                  >
                    <span className="w-[110px] shrink-0 tabular-nums text-ink-muted">
                      {formatTimestamp(entry.ts)}
                    </span>
                    <span className="w-[72px] shrink-0 text-ink">{journalKindLabel(entry.kind)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-faint">{describeKeys(entry)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={BTN_QUIET}
              onClick={() => setOpen(false)}
            >
              关闭
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={entries.length === 0}
              onClick={() => void handleExport()}
            >
              导出 JSON
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 一条记录里「改了什么」的人话描述 */
function describeKeys(entry: JournalEntry): string {
  if (entry.kind === 'trash' || entry.kind === 'restore' || entry.kind === 'remove') {
    return '—'
  }
  const labels = entry.keys
    .filter((key) => key !== 'body')
    .map((key) => KEY_LABELS[key] ?? key)
  if (entry.keys.includes('body')) labels.push('正文')
  return labels.length === 0 ? '—' : labels.join('、')
}

/** 常用键的中文名；表里没有的原样显示（自定义字段本来就用用户自己的键名） */
const KEY_LABELS: Record<string, string> = {
  title: '名字',
  aliases: '别名',
  race: '种族',
  element: '元素',
  occupation: '职业',
  faction: '阵营',
  country: '所属国家',
  height: '身高',
  birthday: '生日',
  bio: '简介',
  lifeStory: '人生故事',
  isMajor: '主要角色',
  avatar: '头像',
  header: '封面',
  gallery: '图集',
  avatars: '头像组',
  relations: '关系',
  tags: '标签',
  order: '排序',
  time: '时间',
  endTime: '结束时间',
  location: '地点',
  summary: '概要',
  characters: '相关角色',
  countries: '相关国家',
  images: '图片',
  parent: '上级',
  description: '描述',
  system: '制度',
  geography: '地理',
  culture: '文化',
  flag: '旗帜',
  category: '分类',
  'graph_position': '图谱位置',
}
