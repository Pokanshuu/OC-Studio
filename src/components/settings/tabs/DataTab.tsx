'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { exportStaticSite } from '@/lib/export'
import { useSettings } from '@/lib/settings'
import { SWITCH_CLASSES, SWITCH_DOT } from '../controls'

/**
 * 设置 › 数据。
 *
 * 原来的「数据」与「云」两个页签合并到这里，内容**按类别分区**：
 * 导入与导出（本机文件）· 同步（云，未上线）。
 * AI 相关功能已整体删除，不再有入口。
 */
export function DataTab() {
  const { handleExport, handleImportClick, dialog } = useImportExport()
  const { settings } = useSettings()
  const [publishing, setPublishing] = useState(false)

  async function handlePublish(): Promise<void> {
    if (publishing) return
    setPublishing(true)
    try {
      const filename = await exportStaticSite()
      toast.success(`已导出 ${filename}`, { description: '单文件静态站，改名 index.html 即可发布到任意静态托管' })
    } catch (error) {
      toast.error('发布失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── 导入与导出 ───────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">导入与导出</h3>
        <button
          onClick={handleImportClick}
          className="touch-feedback flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
        >
          导入数据...
        </button>
        <button
          onClick={handleExport}
          className="touch-feedback flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
        >
          导出完整备份 (.ocbak)
        </button>
        <button
          onClick={() => void handlePublish()}
          disabled={publishing}
          className={`touch-feedback flex h-8 items-center justify-center px-3 text-[13px] transition-colors hover:bg-[var(--oc-hover)] ${
            publishing ? 'text-ink-faint cursor-not-allowed' : 'text-ink'
          }`}
        >
          {publishing ? '正在生成…' : '发布为静态网站...'}
        </button>
      </section>

      {/* ── 同步 ───────────────────────────────── */}
      <section className="flex flex-col gap-3 border-t border-line pt-5">
        {/* 「开发中」标记整块功能，不挂在单个控件下面 —— 云同步与服务端地址是同一级的两项 */}
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-ink">同步</h3>
          <span className="text-xs text-ink-faint">开发中</span>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">云同步</span>
          <button
            role="switch"
            aria-checked={false}
            aria-disabled="true"
            disabled
            title="暂未开放"
            className={`${SWITCH_CLASSES.base} ${SWITCH_CLASSES.off} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className={`${SWITCH_DOT} translate-x-[2px]`} />
          </button>
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-ink">服务端地址</label>
          <input
            type="text"
            value={settings.syncServerUrl}
            onChange={() => {}}
            readOnly
            disabled
            placeholder="https://你的同步服务"
            className="h-8 w-full cursor-not-allowed border-b border-line bg-transparent text-sm text-ink opacity-50 placeholder:text-ink-faint outline-none transition-colors"
          />
        </div>
      </section>

      {dialog}
    </div>
  )
}
