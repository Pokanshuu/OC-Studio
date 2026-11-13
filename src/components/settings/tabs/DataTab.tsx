'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { useExportCenter } from '@/components/shared/export/ExportCenterHost'
import { useSettings } from '@/lib/settings'
import { SETTINGS_ACTION_BTN } from '@/lib/ui-tokens'
import { hasLegacyImportSource } from '@/lib/legacy/availability'
import { importLegacyNovels } from '@/lib/legacy/pr5-novels-import'
import { importLegacyRelations } from '@/lib/legacy/pr5-relations-import'
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
  const openExportCenter = useExportCenter()
  const [importingLegacy, setImportingLegacy] = useState(false)
  /** 旧版本（PR #5 fork）数据：探测不到就不摆这个入口 */
  const [legacyAvailable, setLegacyAvailable] = useState(false)

  useEffect(() => {
    let alive = true
    void hasLegacyImportSource()
      .then((found) => {
        if (alive) setLegacyAvailable(found)
      })
      .catch(() => {
        if (alive) setLegacyAvailable(false)
      })
    return () => {
      alive = false
    }
  }, [])

  /** 老版本（fork）数据：小说在独立库、关系在单独的 relations 表；都是只读 + 幂等导入 */
  async function handleImportLegacy(): Promise<void> {
    if (importingLegacy) return
    setImportingLegacy(true)
    try {
      const novels = await importLegacyNovels()
      const relations = await importLegacyRelations()
      const parts = [
        novels.importedNovels > 0 ? `${novels.importedNovels} 本小说 / ${novels.importedChapters} 章` : '',
        relations.characterEdges + relations.eventEdges > 0
          ? `${relations.characterEdges + relations.eventEdges} 条关系`
          : '',
      ].filter(Boolean)
      if (parts.length === 0) {
        toast('没有可导入的旧版本数据')
      } else {
        toast.success(`已导入 ${parts.join('、')}`, { description: '旧版数据只是被读取，原库未做任何修改' })
      }
    } catch (error) {
      toast.error('导入失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setImportingLegacy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── 导入与导出 ───────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">导入与导出</h3>
        <button
          onClick={handleImportClick}
          className={SETTINGS_ACTION_BTN}
        >
          导入数据...
        </button>
        <button
          onClick={handleExport}
          className={SETTINGS_ACTION_BTN}
        >
          导出数据备份 (.ocbak)
        </button>
        {legacyAvailable ? (
          <button
            onClick={() => void handleImportLegacy()}
            disabled={importingLegacy}
            title="仅当同一设备上存在旧版本数据时显示"
            className={SETTINGS_ACTION_BTN}
          >
            {importingLegacy ? '正在导入…' : '从旧版本导入（小说 / 关系）...'}
          </button>
        ) : null}
        <button
          onClick={() => openExportCenter({ tab: 'site' })}
          className={SETTINGS_ACTION_BTN}
        >
          导出中心...
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
            title="开发中"
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
