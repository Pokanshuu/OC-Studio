'use client'

import { CheckCircle, CircleAlert, FolderOpen, Loader2 } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'

/**
 * 状态栏左侧的指示：当前笔记库文件夹 + 保存状态。
 * 点开就是扫描报告 —— 磁盘上发生了什么，这里是最自然的入口。
 */
export function VaultStatus() {
  const { supported, status, name, writeStatus, showReport } = useVault()

  if (!supported || status !== 'ready' || name === null) return null

  const busy = writeStatus.flushing
  const pending = writeStatus.pending
  const failed = writeStatus.lastError !== null

  const Icon = failed ? CircleAlert : busy || pending > 0 ? Loader2 : CheckCircle
  const iconClass = failed
    ? 'text-warning'
    : busy || pending > 0
      ? 'animate-spin text-ink-muted'
      : 'text-ink-faint'
  const label = failed
    ? '保存异常'
    : busy
      ? '保存中…'
      : pending > 0
        ? `待保存 ${pending}`
        : '已同步'

  return (
    <button
      type="button"
      onClick={showReport}
      title={failed ? (writeStatus.lastError ?? '') : '笔记库概览'}
      className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-faint transition-colors hover:text-ink"
    >
      <FolderOpen size={12} strokeWidth={2} className="shrink-0" />
      <span className="max-w-[16ch] truncate">{name}</span>
      <span className="text-ink-faint/60">·</span>
      <Icon size={12} strokeWidth={2} className={`shrink-0 ${iconClass}`} />
      <span className="shrink-0">{label}</span>
    </button>
  )
}
