'use client'

import type { ReactNode } from 'react'
import { Database, FolderOpen, Loader2, RefreshCw } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import { BTN_PRIMARY, BTN_QUIET, LOADING_TEXT } from '@/lib/ui-tokens'

/**
 * 启动闸门：vault 装载未完成前不渲染主界面。
 * 不这么做的话，列表会先按空库渲染一帧，再被灌入的数据冲掉，闪一下很难看。
 * 浏览器环境（不支持 vault）直接透传，保持原有行为。
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const { supported, status, name, error, openFolder, close } = useVault()

  if (!supported) return <>{children}</>
  if (status === 'ready' || status === 'idle') return <>{children}</>

  const loading = status === 'booting' || status === 'loading'

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-6">
      {loading ? (
        <>
          <Loader2 size={18} strokeWidth={2} className="animate-spin text-ink-muted" />
          <div className="flex flex-col items-center gap-1">
            <p className={LOADING_TEXT}>正在载入仓库{name === null ? '…' : `：${name}`}</p>
            <p className="text-[11px] text-ink-faint">读取文件夹并解析 Markdown 与 frontmatter</p>
          </div>
        </>
      ) : (
        <>
          <p className="font-serif text-[15px] font-bold text-ink">无法载入仓库</p>
          <p className="max-w-md text-center text-[13px] text-ink-muted">{error ?? '未知错误'}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={() => void openFolder()}>
              <FolderOpen size={14} strokeWidth={2} />
              选择其它文件夹
            </button>
            <button type="button" className={BTN_QUIET} onClick={() => void close()}>
              <Database size={14} strokeWidth={2} />
              改用内置数据库
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** 写盘发生冲突 / 失败时的顶部提示条（不做成模态，别打断创作） */
export function VaultWriteBanner() {
  const { supported, status, writeStatus, flush, rescan } = useVault()
  if (!supported || status !== 'ready') return null
  if (writeStatus.lastError === null) return null

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-paper-alt px-4 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{writeStatus.lastError}</span>
      <button type="button" className={BTN_QUIET} onClick={() => void flush()}>
        <RefreshCw size={13} strokeWidth={2} />
        重试写盘
      </button>
      <button type="button" className={BTN_QUIET} onClick={() => void rescan()}>
        以磁盘为准重载
      </button>
    </div>
  )
}
