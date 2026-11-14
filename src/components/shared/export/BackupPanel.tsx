'use client'

/**
 * 导出中心 · 备份页签。
 *
 * `.ocbak` 是唯一备份格式（版本字段在文件里，不做第二套）。这里做三件事：
 * 1. 把库里有什么摊开给人看（实体 / 灵感 / 空文件夹）；
 * 2. 在导出**之前**说清哪些 store 在里面、哪些明确不打包（助手会话与密钥、回收站…）；
 * 3. 导出**之后**保留缺图 / 跳过素材的清单 —— 不用成功 toast 盖住遗漏。
 *
 * 登记表在 `lib/export/backup-manifest.ts`（唯一源），这里不手写第二份。
 */
import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { downloadFullBackup } from '@/lib/export'
import { loadSiteData } from '@/lib/export/site'
import { db } from '@/lib/db'
import { backupExcludeStores, backupIncludeStores } from '@/lib/export/backup-manifest'
import { countEmptyWorldFolders, loadWorldFolderRegistry, useWorldFolderRegistryMap } from '@/features/categories/folders'
import { loadInspirations, useInspirations } from '@/features/inspirations/store'
import { BTN_PRIMARY, ROUND_ITEM } from '@/lib/ui-tokens'
import type { WorldEntry } from '@/types'
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

/** 上次导出留下的「没打包成功」的素材；导出面板里必须一直看得见，不能只活 4 秒 */
interface ExportIssues {
  missingImages: string[]
  skippedImages: string[]
  configWarnings: string[]
  /** 清单是否声明完整；不完整时文件里确实缺了段落 / 素材 */
  complete: boolean
}

const ISSUE_PREVIEW = 5

export function BackupPanel() {
  const [inventory, setInventory] = useState<Inventory>(EMPTY)
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [lastError, setLastError] = useState('')
  const [issues, setIssues] = useState<ExportIssues | null>(null)

  const inspirations = useInspirations()
  const folderMap = useWorldFolderRegistryMap()
  const emptyFolders = useMemo(() => countEmptyWorldFolders(folderMap, entries), [folderMap, entries])

  useEffect(() => {
    // 这两份平时是懒加载的（分类页 / 便签挂载时才读）；备份要的是全量库存，先补一次。
    void loadWorldFolderRegistry()
    void loadInspirations()
    void Promise.all([loadSiteData(), db.tags.count()])
      .then(([data, tags]) => {
        setEntries(data.worldEntries)
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
    setLastError('')
    try {
      const result = await downloadFullBackup()
      setSaved(result.fileName)
      setIssues({
        missingImages: result.missingImages,
        skippedImages: result.skippedImages,
        configWarnings: result.configWarnings,
        complete: result.complete,
      })
      if (result.missingImages.length > 0) {
        // 有遗漏时**不能用 success**：成功只说明文件写出来了，不说明素材齐了
        toast.warning('备份已导出，但清单标注不完整', {
          description: `${result.fileName}；${result.missingImages.length} 张图片读不到字节，备份里只有路径。`,
        })
      } else if (result.skippedImages.length > 0) {
        toast.warning('备份已导出，但清单标注不完整', {
          description: `${result.fileName}；${result.skippedImages.length} 个 blob: 地址只在当前会话有效，没有写进备份。`,
        })
      } else if (result.configWarnings.length > 0) {
        toast.warning('备份已导出，但清单标注不完整', {
          description: `${result.fileName}；${result.configWarnings.join('；')}`,
        })
      } else if (!result.complete) {
        // 兜底：清单自己说缺东西，但上面三类都没捕到（未来新增的缺失类型）
        toast.warning('备份已导出，但清单标注不完整', {
          description: `${result.fileName}；这份备份缺少登记表声称应包含的内容，详见「最近」。`,
        })
      } else {
        toast.success('数据备份已导出', { description: result.fileName })
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setLastError(message)
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
    { label: '灵感', value: inspirations.length },
    { label: '空文件夹', value: emptyFolders },
  ]

  const included = backupIncludeStores()
  const excluded = backupExcludeStores()

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
            图片与封面一并内联；灵感正文、分类空文件夹，以及分类 / 字段表 / 模板 / 信息组 / 正文组 /
            文件夹清单与创作时间线都一起打包。助手会话与密钥、回收站、应用背景图和导出预设不在这个文件里。
            导入时设置只在目标还是空的时才恢复；灵感按条合并，同一条被两边改过时保留两份。
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
                导出前会把还没落盘的草稿先刷出去；刷不成功就中止，不会给一份少一段字的备份。
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

          <ExportSection title="包含">
            <p className="text-[11px] leading-relaxed text-ink-faint">
              {included.map((store) => store.label).join(' · ')}
            </p>
          </ExportSection>

          <ExportSection title="不包含">
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              {excluded.map((store) => (
                <div key={store.id} className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-ink-muted">{store.label}</span>
                  <span className="text-[11px] leading-relaxed text-ink-faint">{store.reason}</span>
                </div>
              ))}
            </div>
          </ExportSection>

          <ExportSection title="最近">
            <span className="truncate text-[11px] text-ink-faint">
              {saved === '' ? '还没有导出过' : saved}
            </span>
            {lastError !== '' && (
              <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
                上次导出中止：{lastError}
              </p>
            )}
            {issues !== null && !issues.complete && (
              <div className="border-t border-line pt-3">
                <span className="text-[12px] text-ink">清单：本次备份不完整</span>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                  文件里的 manifest 已标注缺了哪些段；换机器恢复时这些段不会被还原。
                </p>
              </div>
            )}
            {issues !== null && issues.missingImages.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-[12px] text-ink">
                  缺图 {issues.missingImages.length} 张（备份里只有路径）
                </span>
                {issues.missingImages.slice(0, ISSUE_PREVIEW).map((url) => (
                  <span key={url} className="truncate text-[11px] text-ink-faint" title={url}>
                    {url}
                  </span>
                ))}
                {issues.missingImages.length > ISSUE_PREVIEW && (
                  <span className="text-[11px] text-ink-faint">
                    …另有 {issues.missingImages.length - ISSUE_PREVIEW} 张，导入后需重新指图
                  </span>
                )}
              </div>
            )}
            {issues !== null && issues.skippedImages.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-[12px] text-ink">
                  跳过 {issues.skippedImages.length} 个会话内素材
                </span>
                <span className="text-[11px] leading-relaxed text-ink-faint">
                  blob: 地址刷新即失效，写进备份也打不开；需要的话先保存到库里再导出。
                </span>
              </div>
            )}
            {issues !== null && issues.configWarnings.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-[12px] text-ink">部分设置没读出来</span>
                {issues.configWarnings.map((warning) => (
                  <span key={warning} className="text-[11px] leading-relaxed text-ink-faint">
                    {warning}
                  </span>
                ))}
              </div>
            )}
          </ExportSection>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">.ocbak · 含图片与灵感</span>
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
