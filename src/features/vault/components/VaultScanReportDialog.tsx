'use client'

import { RefreshCw } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import { BTN_PRIMARY, BTN_QUIET, SECTION_TITLE } from '@/lib/ui-tokens'
import type { VaultEntityKind, VaultScanReport } from '@/lib/vault/types'
import { VaultOverlay } from './VaultOverlay'

const KIND_LABEL: Record<VaultEntityKind, string> = {
  character: '角色',
  country: '国家',
  event: '事件',
  worldEntry: '词条',
  tag: '标签',
  period: '时期',
  ignore: '未映射',
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className={`${SECTION_TITLE} mb-0`}>{title}</h3>
        {hint !== undefined ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-[3px]">
      <span className="w-32 shrink-0 text-[12px] text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 text-[12px] text-ink">{value}</span>
    </div>
  )
}

/** 一列「名字 + 次数 + 来源」的行，用于断链/歧义/待建阵营 */
function RefList({
  items,
  emptyText,
  limit = 40,
}: {
  items: { name: string; count: number; sources: string[] }[]
  emptyText: string
  limit?: number
}) {
  if (items.length === 0) {
    return <p className="text-[12px] text-ink-faint">{emptyText}</p>
  }
  const shown = items.slice(0, limit)
  return (
    <div className="flex flex-col">
      {shown.map((item) => (
        <div key={item.name} className="flex items-baseline gap-3 border-b border-line/60 py-[3px] last:border-b-0">
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{item.name}</span>
          <span className="shrink-0 tabular-nums text-[11px] text-ink-faint">{item.count} 处</span>
          <span className="min-w-0 max-w-[45%] shrink-0 truncate text-[11px] text-ink-faint">
            {item.sources.slice(0, 2).join('、')}
            {item.sources.length > 2 ? '…' : ''}
          </span>
        </div>
      ))}
      {items.length > limit ? (
        <p className="pt-1 text-[11px] text-ink-faint">… 另有 {items.length - limit} 项</p>
      ) : null}
    </div>
  )
}

function PathList({ paths, emptyText }: { paths: string[]; emptyText: string }) {
  if (paths.length === 0) return <p className="text-[12px] text-ink-faint">{emptyText}</p>
  return (
    <div className="flex flex-col">
      {paths.map((path) => (
        <span key={path} className="truncate py-[3px] text-[12px] text-ink-muted">
          {path}
        </span>
      ))}
    </div>
  )
}

function ReportBody({ report }: { report: VaultScanReport }) {
  const { links, aliases } = report

  const kindCounts = (Object.entries(report.byKind) as [VaultEntityKind, number][])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${KIND_LABEL[kind]} ${count}`)
    .join(' · ')

  const unresolvedLinks = links.unresolved.map((item) => ({
    name: item.target,
    count: item.count,
    sources: item.sources,
  }))
  const ambiguousLinks = links.ambiguous.map((item) => ({
    name: `${item.target} → ${item.ambiguous.map((path) => path.split('/').pop() ?? path).join(' / ')}`,
    count: item.count,
    sources: item.sources,
  }))

  return (
    <div className="flex flex-col">
      <Section title="这个文件夹里有什么">
        <KeyValue label="Markdown 文件" value={`${report.noteCount} 篇`} />
        <KeyValue label="落库构成" value={kindCounts === '' ? '无' : kindCounts} />
        {report.emptyFiles.length > 0 ? (
          <KeyValue label="空文件" value={`${report.emptyFiles.length} 个（跳过，不删）`} />
        ) : null}
      </Section>

      <Section title="目录 → 类型" hint="按目录名关键词自动识别；认不出的目录只报告，不改动">
        <div className="flex flex-col">
          {report.folders.map((folder) => (
            <div
              key={`${folder.folder}-${folder.kind}`}
              className="flex items-baseline gap-3 border-b border-line/60 py-[3px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{folder.folder}</span>
              <span className="shrink-0 text-[11px] text-ink-muted">{KIND_LABEL[folder.kind]}</span>
              <span className="w-12 shrink-0 text-right tabular-nums text-[11px] text-ink-faint">
                {folder.count} 篇
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="链接解析" hint="[[文件名]] 与别名是这套仓库的骨架">
        <KeyValue label="链接总数" value={`${links.total} 处 / ${links.distinct} 个不同目标`} />
        <KeyValue
          label="已解析"
          value={`${links.resolved} 处（${links.total === 0 ? '—' : `${((links.resolved / links.total) * 100).toFixed(1)}%`}），其中经由别名 ${links.viaAlias} 处`}
        />
        <div className="pt-2">
          <p className="mb-1 text-[12px] text-ink-muted">未解析目标（{unresolvedLinks.length}）</p>
          <RefList items={unresolvedLinks} emptyText="没有断链。" />
        </div>
        {ambiguousLinks.length > 0 ? (
          <div className="pt-3">
            <p className="mb-1 text-[12px] text-ink-muted">
              歧义目标（{ambiguousLinks.length}）：指向多个文件，不自动选边
            </p>
            <RefList items={ambiguousLinks} emptyText="" />
          </div>
        ) : null}
      </Section>

      <Section title="别名">
        <KeyValue
          label="声明与命中"
          value={`声明 ${aliases.total} 个，被正文引用到 ${aliases.usedByLinks} 个`}
        />
        <div className="pt-2">
          <p className="mb-1 text-[12px] text-ink-muted">冲突（{aliases.conflicts.length}）</p>
          {aliases.conflicts.length === 0 ? (
            <p className="text-[12px] text-ink-faint">没有冲突。</p>
          ) : (
            <RefList
              items={aliases.conflicts.map((item) => ({
                name: item.alias,
                count: item.paths.length,
                sources: item.paths,
              }))}
              emptyText=""
            />
          )}
        </div>
      </Section>

      {report.unresolvedFactions.length > 0 ? (
        <Section
          title={`阵营没有对应词条（${report.unresolvedFactions.length}）`}
          hint="阵营是自由文本；建了同名词条就会自动可跳转"
        >
          <RefList
            items={report.unresolvedFactions.map((item) => ({
              name: item.name,
              count: item.count,
              sources: item.sources,
            }))}
            emptyText=""
            limit={20}
          />
        </Section>
      ) : null}

      {report.skippedDirs.length > 0 ? (
        <Section title={`跳过的目录（${report.skippedDirs.length}）`}>
          <PathList paths={report.skippedDirs} emptyText="" />
        </Section>
      ) : null}

      {report.unmapped.length > 0 ? (
        <Section
          title={`未映射的文件（${report.unmapped.length}）`}
          hint="目录不在关键词表里；文件原样保留，不会被动"
        >
          <PathList paths={report.unmapped.map((item) => item.relPath)} emptyText="" />
        </Section>
      ) : null}

      {report.emptyFiles.length > 0 ? (
        <Section title={`空文件（${report.emptyFiles.length}）`}>
          <PathList paths={report.emptyFiles} emptyText="" />
        </Section>
      ) : null}

      {report.unparsedFrontmatter.length > 0 ? (
        <Section title={`frontmatter 解析失败（${report.unparsedFrontmatter.length}）`}>
          <div className="flex flex-col gap-1">
            {report.unparsedFrontmatter.map((item) => (
              <div key={item.relPath}>
                <span className="text-[12px] text-ink">{item.relPath}</span>
                <p className="text-[11px] text-error">{item.error}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {report.unparsedBodies.length > 0 ? (
        <Section
          title={`正文无法解析（${report.unparsedBodies.length}）`}
          hint="这些笔记在编辑器里显示为空，但文件不会被改动"
        >
          <div className="flex flex-col gap-1">
            {report.unparsedBodies.map((item) => (
              <div key={item.relPath}>
                <span className="text-[12px] text-ink">{item.relPath}</span>
                <p className="text-[11px] text-error">{item.error}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

export function VaultScanReportDialog() {
  const { reportOpen, hideReport, report, rescan, root } = useVault()

  return (
    <VaultOverlay
      open={reportOpen && report !== null}
      title="仓库扫描报告"
      description={root ?? undefined}
      onClose={hideReport}
      widthClass="max-w-2xl"
      footer={
        <>
          <button type="button" className={BTN_QUIET} onClick={() => void rescan()}>
            <RefreshCw size={13} strokeWidth={2} />
            重新扫描磁盘
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={hideReport}>
            知道了
          </button>
        </>
      }
    >
      {report === null ? null : (
        <div className="flex flex-col">
          <ReportBody report={report.scan.report} />

          {report.truncated ? (
            <Section title="扫描被截断">
              <p className="text-[12px] text-warning">
                文件数超过上限，只装载了前一部分。请把仓库拆小，或确认是否选错了目录。
              </p>
            </Section>
          ) : null}

          {report.warnings.length > 0 ? (
            <Section title={`读取告警（${report.warnings.length}）`}>
              <div className="flex flex-col">
                {report.warnings.slice(0, 30).map((warning) => (
                  <span key={warning} className="py-[3px] text-[12px] text-ink-muted">
                    {warning}
                  </span>
                ))}
                {report.warnings.length > 30 ? (
                  <span className="pt-1 text-[11px] text-ink-faint">
                    … 另有 {report.warnings.length - 30} 条
                  </span>
                ) : null}
              </div>
            </Section>
          ) : null}

          {report.otherFiles.length > 0 ? (
            <Section
              title={`其它文件（${report.otherFiles.length}）`}
              hint="不是 Markdown；OC Studio 不解析也不改动它们"
            >
              <PathList paths={report.otherFiles.slice(0, 40)} emptyText="" />
            </Section>
          ) : null}
        </div>
      )}
    </VaultOverlay>
  )
}
