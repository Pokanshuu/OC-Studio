'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, FolderInput, FolderOpen, FolderPlus, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import { db } from '@/lib/db'
import { useImportExport } from '@/components/shared/ImportExportUI'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BTN_PRIMARY, BTN_QUIET, LOADING_TEXT, ROUND_CONTROL } from '@/lib/ui-tokens'
import { useLegacyImport } from '../hooks/useLegacyImport'

/**
 * 启动闸门。
 *
 * **没有「内置数据库模式」了**：应用永远绑定一个本地文件夹，数据只在那个文件夹里。
 * 没有绑定过 → 欢迎引导；正在载入 → 等；载入失败 → 只有「换个文件夹」，没有退路。
 *
 * 为什么砍掉内置模式：两套真源会带来无穷的同步语义（关掉文件夹之后的编辑算谁的？
 * 下次打开被谁覆盖？）。文件是真源，应用内那份只是这次会话的缓存，退出即散。
 *
 * 浏览器环境（不支持本地文件夹）直接透传，只用于开发时看界面。
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const { supported, status, name, error, openFolder, createFolder, migrateLegacy } = useVault()
  const [orphanCount, setOrphanCount] = useState(0)
  const { start: startLegacy, dialog: legacyDialog, migrating } = useLegacyImport()

  // 从备份文件导入：导完接着落地成文件夹。
  // 只导入不落地 = 数据只在 Dexie 里，下次打开文件夹就被整库替换掉（这是最容易踩的坑）。
  const {
    handleExport,
    handleImportClick,
    dialog: importDialog,
  } = useImportExport({
    // 合并策略原样传给落地：选了什么策略，文件夹里就按什么策略处理同名笔记
    onImported: (_result, strategy) => void migrateLegacy({ strategy }),
  })

  // 老版本留下的内置库数据：不再有任何东西会读写它，提醒先搬进文件夹（或至少导出一份）
  useEffect(() => {
    if (!supported || status !== 'idle') return
    let cancelled = false
    void Promise.all([
      db.characters.count(),
      db.events.count(),
      db.countries.count(),
      db.worldEntries.count(),
      db.tags.count(),
      db.periods.count(),
    ]).then((counts) => {
      if (!cancelled) setOrphanCount(counts.reduce((sum, n) => sum + n, 0))
    })
    return () => { cancelled = true }
  }, [supported, status])

  if (!supported) return <>{children}</>
  if (status === 'ready') return <>{children}</>

  const loading = status === 'booting' || status === 'loading'

  if (loading) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <Loader2 size={18} strokeWidth={2} className="animate-spin text-ink-muted" />
        <div className="flex flex-col items-center gap-1">
          <p className={LOADING_TEXT}>
            {migrating
              ? '正在写入文件夹…'
              : `正在载入${name === null ? '文件夹…' : `：${name}`}`}
          </p>
          {migrating ? null : (
            <p className="text-[11px] text-ink-faint">读取文件夹并解析 Markdown 与 frontmatter</p>
          )}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="font-serif text-[15px] font-bold text-ink">无法载入文件夹</p>
        <p className="max-w-md text-center text-[13px] text-ink-muted">{error ?? '未知错误'}</p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={() => void openFolder()}>
            <FolderOpen size={14} strokeWidth={2} />
            选择其它文件夹
          </button>
          <button type="button" className={BTN_QUIET} onClick={() => void createFolder()}>
            <FolderPlus size={14} strokeWidth={2} />
            新建文件夹
          </button>
        </div>
      </div>
    )
  }

  // idle：还没有绑定文件夹
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-5 px-6">
      <p className="font-serif text-lg font-bold text-ink">选择一个文件夹作为笔记库</p>

      {/* 单列网格：所有内容都落在同一条 288px 的列上，左右边缘对齐 */}
      <div className="flex w-72 flex-col gap-3">
        {orphanCount > 0 ? (
          <div className="flex flex-col gap-2">
            {/* 抬头行：文字与链接并在一起居中 */}
            <div className="flex items-center justify-center gap-3">
              <p className="truncate text-[12px] text-ink-muted">
                检测到 {orphanCount} 条旧版本数据
              </p>
              <button
                type="button"
                className="shrink-0 text-[12px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                onClick={() => void handleExport()}
              >
                导出备份
              </button>
            </div>
            <div
              className={`flex h-8 w-full items-stretch overflow-hidden bg-paper-card text-[13px] text-ink ${ROUND_CONTROL}`}
            >
              <button
                type="button"
                className="touch-feedback flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 transition-colors hover:bg-line"
                onClick={() => void startLegacy()}
              >
                <FolderInput size={14} strokeWidth={2} />
                <span className="truncate">备份旧版本数据并导入到…</span>
              </button>
              <span className="my-1.5 w-px shrink-0 bg-line" />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex w-8 shrink-0 items-center justify-center transition-colors hover:bg-line">
                  <ChevronDown size={13} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleImportClick}>导入旧版本备份</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`${BTN_PRIMARY} w-full justify-center`}
            onClick={() => void openFolder()}
          >
            <FolderOpen size={14} strokeWidth={2} />
            打开已有 OC Studio 笔记库
          </button>
          <button
            type="button"
            className={`${BTN_QUIET} w-full justify-center`}
            onClick={() => void createFolder()}
          >
            <FolderPlus size={14} strokeWidth={2} />
            新建文件夹…
          </button>
        </div>

        {orphanCount > 0 ? (
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-warning">
            <TriangleAlert size={12} strokeWidth={2} />
            打开或新建文件夹会替换掉旧版数据
          </p>
        ) : null}
      </div>

      {importDialog}
      {legacyDialog}
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
        重试保存
      </button>
      <button type="button" className={BTN_QUIET} onClick={() => void rescan()}>
        以文件夹为准重载
      </button>
    </div>
  )
}
