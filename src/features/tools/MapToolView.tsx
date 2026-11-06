'use client'

/**
 * 「工具 › 地图生成器」—— 直接进入的生成器。
 *
 * 和地图里那个入口的差别只有**落点**：这里每次提交都**新建一张地图**，而且要
 * **先给它起个名字**（按形态预填 `世界地图` / `区域地图`，重名时自动换成没占用的那个）。
 * 建完直接跳到那张图；在地图里打开的生成器才是「写回这张图的底图」。
 *
 * 生成、渲染、落盘全程复用插件边界与 `saveGeneratedMap`，一行算法都不在这里。
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MapGeneratorPanel } from '@/features/map/MapGeneratorPanel'
import { createNamedMap, deleteMap, suggestMapName } from '@/features/map/services'
import { saveGeneratedMap, type MapViewRenderer } from '@/features/map/save-generated'
import { requestOpenMap } from '@/features/map/open-request'
import { notifyDataUpdated } from '@/lib/data-events'
import { useNavigation } from '@/components/layout/NavigationContext'
import { BTN_PRIMARY, BTN_QUIET, INPUT_LINE, PAGE_TITLE } from '@/lib/ui-tokens'
import type { MapView, WorldMapParams } from '@/plugins/map-generator'

/**
 * 上一次提交用的种子与参数。
 *
 * 提交后工具页会**直接跳到地图**（`ToolSection` 只在该分区渲染，等于卸载），
 * 组件状态跟着丢。放在模块作用域里，同一次会话再回到工具页就能接着调同一片大陆。
 */
let lastGeneration: { seed: number; params: WorldMapParams } | null = null

/** 面板交过来、还没落盘的那一张图 */
interface PendingGeneration {
  blob: Blob
  size: { width: number; height: number }
  seed: number
  params: WorldMapParams
  view: MapView
  /** 生成器那只 Worker 的渲染器：其余五档不再重新生成世界 */
  renderView?: MapViewRenderer
}

export function MapToolView() {
  const { setActiveItem } = useNavigation()
  const [pending, setPending] = useState<PendingGeneration | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ stage: string; value: number } | null>(null)

  /** 面板交来一张生成好的图：先接住，命名之后再落盘 */
  const handleUse = useCallback(
    async (
      blob: Blob,
      size: { width: number; height: number },
      seed: number,
      params: WorldMapParams,
      view: MapView,
      _onProgress?: (stage: string, value: number) => void,
      renderView?: MapViewRenderer,
    ): Promise<void> => {
      const base = params.kind === 'region' ? '区域地图' : '世界地图'
      // 进度条由这个对话框自己画（`commit` 的 onProgress），面板那条胶囊留在背后
      setPending({ blob, size, seed, params, view, renderView })
      setName(base)
      setProgress(null)
      // 默认名被占用时换成一个没占的；用户已经开始改了就不覆盖他的输入
      const suggested = await suggestMapName(base)
      setName((current) => (current === base ? suggested : current))
    },
    [],
  )

  const commit = useCallback(
    async (rawName: string) => {
      const trimmed = rawName.trim()
      if (!pending || saving || !trimmed) return
      setSaving(true)
      setProgress({ stage: '', value: 0 })
      let createdId: number | null = null
      try {
        const created = await createNamedMap(trimmed)
        createdId = created.id
        await saveGeneratedMap({
          mapId: created.id,
          mapName: created.name,
          blob: pending.blob,
          size: pending.size,
          seed: pending.seed,
          params: pending.params,
          view: pending.view,
          renderView: pending.renderView,
          onProgress: (stage, value) => setProgress({ stage, value }),
        })
        lastGeneration = { seed: pending.seed, params: pending.params }
        notifyDataUpdated()
        setPending(null)
        toast.success(`已新建「${created.name}」`)
        // 直接跳过去看成品（不再等用户点 toast 里的「打开」）
        requestOpenMap(created.id)
        setActiveItem('地图')
      } catch (err) {
        // 图没写成（保存失败 / 用户取消对话框）就别留一张空地图 —— 那正是「一地新地图」的来源
        if (createdId !== null) await deleteMap(createdId).catch(() => undefined)
        toast.error('新建地图失败', {
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setSaving(false)
        setProgress(null)
      }
    },
    [pending, saving, setActiveItem],
  )

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <MapGeneratorPanel
        onUseAsBackground={handleUse}
        target={{ kind: 'new' }}
        initialSeed={lastGeneration?.seed}
        initialParams={lastGeneration ? JSON.stringify(lastGeneration.params) : undefined}
      />

      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setPending(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={PAGE_TITLE}>新建地图</DialogTitle>
          </DialogHeader>

          <input
            autoFocus
            type="text"
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit(name)
              }
            }}
            placeholder="地图名"
            aria-label="地图名"
            className={INPUT_LINE}
          />

          {progress ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 text-[12px] text-ink-faint">
                <span className="min-w-0 truncate">{progress.stage || '写入底图'}</span>
                <span className="shrink-0 tabular-nums">{Math.round(progress.value * 100)}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.value * 100)}
                className="h-1 w-full overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full rounded-full bg-ink-muted transition-[width] duration-150"
                  style={{ width: `${Math.round(progress.value * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={saving}
              className={BTN_QUIET}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void commit(name)}
              disabled={saving || !name.trim()}
              className={BTN_PRIMARY}
            >
              <Check size={14} strokeWidth={2} />
              <span>创建</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
