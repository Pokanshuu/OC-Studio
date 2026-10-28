'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import { BTN_PRIMARY, BTN_QUIET } from '@/lib/ui-tokens'
import type { VaultEntityKind, VaultScanReport } from '@/lib/vault/types'
import { VaultOverlay } from './VaultOverlay'

/** 构成里只报这几类；其余（未映射等）不是用户要看的盘子 */
const KIND_ORDER: VaultEntityKind[] = ['character', 'country', 'event', 'worldEntry', 'tag', 'period']

const KIND_LABEL: Record<VaultEntityKind, string> = {
  character: '角色',
  country: '国家',
  event: '事件',
  worldEntry: '词条',
  tag: '标签',
  period: '时期',
  ignore: '未知',
}

/** 展开前的展示上限，超出的只报个数 */
const LIST_LIMIT = 50

interface UnknownItem {
  label: string
  note: string
}

/**
 * 只留「没弄明白的」：认不出的文件、跳不过去的链接、读不出来的文件。
 * 三类合成一张清单 —— 对用户来说是同一件事：这条没生效，要不要管。
 */
function collectUnknown(report: VaultScanReport): UnknownItem[] {
  const items: UnknownItem[] = []

  for (const item of report.unmapped) {
    items.push({ label: item.relPath, note: '文件夹不认识' })
  }
  for (const item of report.links.unresolved) {
    items.push({ label: item.target, note: `${item.count} 处链接 · 没有同名笔记` })
  }
  for (const item of report.links.ambiguous) {
    items.push({ label: item.target, note: `${item.count} 处链接 · 有多篇同名` })
  }
  for (const item of report.unparsedFrontmatter) {
    items.push({ label: item.relPath, note: '读不出来' })
  }
  for (const item of report.unparsedBodies) {
    items.push({ label: item.relPath, note: '读不出来' })
  }

  return items
}

function UnknownList({ items }: { items: UnknownItem[] }) {
  const [open, setOpen] = useState(false)
  const Icon = open ? ChevronDown : ChevronRight
  const shown = items.slice(0, LIST_LIMIT)

  return (
    <div className="flex flex-col border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-mx-2 flex w-full items-center gap-2 rounded-item px-2 py-2.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
      >
        <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 truncate">未知 {items.length} 项</span>
      </button>
      {open ? (
        <div className="flex flex-col pb-2 pl-6">
          {shown.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="flex items-baseline gap-3 border-b border-line/60 py-[3px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{item.label}</span>
              <span className="shrink-0 text-[11px] text-ink-faint">{item.note}</span>
            </div>
          ))}
          {items.length > LIST_LIMIT ? (
            <span className="pt-1 text-[11px] text-ink-faint">
              … 另有 {items.length - LIST_LIMIT} 项
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function OverviewBody({ report, truncated }: { report: VaultScanReport; truncated: boolean }) {
  const composition = KIND_ORDER.filter((kind) => report.byKind[kind] > 0)
    .map((kind) => `${KIND_LABEL[kind]} ${report.byKind[kind]}`)
    .join('、')

  const unknown = collectUnknown(report)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink">
        {report.noteCount} 篇笔记{composition === '' ? null : ` → ${composition}`}
      </p>

      {truncated ? (
        <p className="text-[12px] text-warning">文件太多，只扫了一部分。</p>
      ) : null}

      {unknown.length > 0 ? (
        <UnknownList items={unknown} />
      ) : (
        <p className="text-[12px] text-ink-faint">没有发现问题。</p>
      )}
    </div>
  )
}

export function VaultScanReportDialog() {
  const { reportOpen, hideReport, report, rescan, root } = useVault()

  return (
    <VaultOverlay
      open={reportOpen && report !== null}
      title="概览"
      description={root ?? undefined}
      onClose={hideReport}
      widthClass="max-w-md"
      footer={
        <>
          <button type="button" className={BTN_QUIET} onClick={() => void rescan()}>
            <RefreshCw size={13} strokeWidth={2} />
            重新扫描
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={hideReport}>
            关闭
          </button>
        </>
      }
    >
      {report === null ? null : (
        <OverviewBody report={report.scan.report} truncated={report.truncated} />
      )}
    </VaultOverlay>
  )
}
