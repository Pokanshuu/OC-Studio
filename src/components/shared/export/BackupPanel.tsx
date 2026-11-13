'use client'

/**
 * 导出中心 · 备份页签。
 *
 * `.ocbak` 是唯一备份格式（版本字段在文件里，不做第二套）。这里只做一件事：
 * 把库里有什么摊开给人看，然后一键导出。
 */
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { downloadFullBackup } from '@/lib/export'
import { loadSiteData } from '@/lib/export/site'
import { db } from '@/lib/db'
import { BTN_PRIMARY, ROUND_ITEM } from '@/lib/ui-tokens'
import { ExportSection } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

interface Inventory {
  world: string
  characters: number
  events: number
  countries: number
  worldEntries: number
  tags: number
  periods: number
}

const EMPTY: Inventory = {
  world: '',
  characters: 0,
  events: 0,
  countries: 0,
  worldEntries: 0,
  tags: 0,
  periods: 0,
}

export function BackupPanel() {
  const [inventory, setInventory] = useState<Inventory>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    void Promise.all([loadSiteData(), db.tags.count()])
      .then(([data, tags]) => {
        setInventory({
          world: (data.meta?.worldName ?? '').trim() || '未命名世界',
          characters: data.characters.length,
          events: data.events.length,
          countries: data.countries.length,
          worldEntries: data.worldEntries.length,
          tags,
          periods: data.periods.length,
        })
      })
      .catch(() => setInventory(EMPTY))
  }, [])

  const handleExport = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const { fileName, missingImages } = await downloadFullBackup()
      setSaved(fileName)
      toast.success('数据备份已导出', {
        description:
          missingImages.length > 0
            ? `${fileName}；${missingImages.length} 张图片找不到原件，备份里只有路径`
            : fileName,
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      if (message !== '已取消') toast.error('备份导出失败', { description: message })
    } finally {
      setBusy(false)
    }
  }

  const rows = [
    { label: '角色', value: inventory.characters },
    { label: '事件', value: inventory.events },
    { label: '国家', value: inventory.countries },
    { label: '词条', value: inventory.worldEntries },
    { label: '标签', value: inventory.tags },
    { label: '时期', value: inventory.periods },
  ]

  return (
    <ExportPanelLayout
      previewClassName="items-center justify-center p-8"
      preview={
        <div className={`w-full max-w-[420px] border border-line bg-paper p-8 ${ROUND_ITEM}`}>
          <div className="text-[11px] tracking-[0.18em] text-ink-faint">OC STUDIO · BACKUP</div>
          <h2 className="mt-3 font-serif text-[28px] font-bold leading-tight text-ink">{inventory.world}</h2>
          <div className="mt-6 grid grid-cols-3 gap-y-4">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-col gap-1">
                <span className="font-serif text-[24px] tabular-nums leading-none text-ink">{row.value}</span>
                <span className="text-[11px] text-ink-faint">{row.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
            图片与封面一并内联；分类 / 字段表 / 模板 / 信息组 / 正文组 / 文件夹清单，以及创作时间线（只追加的操作记录），都一起打包。导入时设置只在目标还是空的时才恢复；时间线按条去重后并进本地，同一份备份导两次不会重复。助手是插件，会话与它的备份在助手自己的入口里，不在这个文件里。
          </div>
        </div>
      }
      config={
        <>
          <ExportSection title="备份">
            <p className="text-[12px] leading-relaxed text-ink-muted">
              一个 .ocbak 文件包含全部实体、图片与关系，换设备后可以还原。
              <span className="text-ink-faint">
                {' '}
                分类、字段表、模板这些设置也装在里面，导入到空库时一并恢复；目标已经有自己的设置时一律保留。
              </span>
            </p>
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-muted">{row.label}</span>
                  <span className="tabular-nums text-ink">{row.value}</span>
                </div>
              ))}
            </div>
          </ExportSection>
          <ExportSection title="最近">
            <span className="truncate text-[11px] text-ink-faint">{saved === '' ? '还没有导出过' : saved}</span>
          </ExportSection>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">.ocbak · 含图片</span>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy}
            className={`${BTN_PRIMARY} ${busy ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在打包…' : '导出备份'}
          </button>
        </>
      }
    />
  )
}
