'use client'

/**
 * 「工具 › 地图生成器」——把插件面板搬到独立工具页。
 *
 * 与地图视图里那个入口的区别只有一个：**这里先选目标地图**，不要求你先打开地图。
 * 生成、渲染、落盘全程复用插件边界（`@/plugins/map-generator`）与地图服务的
 * `saveMapImage` / `setMapBackground`，一行算法都不在这里。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { MapGeneratorPanel } from '@/features/map/MapGeneratorPanel'
import { listMaps, setMapBackground, type MapEntity } from '@/features/map/services'
import { mapViewFileName, saveMapImage } from '@/features/map/assets'
import { notifyDataUpdated } from '@/lib/data-events'
import { LOADING_TEXT, ROUND_ITEM } from '@/lib/ui-tokens'
import type { MapView } from '@/plugins/map-generator'
import type { WorldMapParams } from '@/plugins/map-generator'

const CHIP = 'h-7 shrink-0 rounded-item px-2.5 text-[12px] transition-colors'

export function MapToolView() {
  const [maps, setMaps] = useState<MapEntity[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const list = await listMaps()
      setMaps(list)
      setActiveId((current) => (current !== null && list.some((map) => map.id === current) ? current : (list[0]?.id ?? null)))
    } catch (err) {
      console.error('[tools] 读取地图失败', err)
      setMaps([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏读地图列表；setState 在异步回调里
    void reload()
  }, [reload])

  const active = useMemo(() => maps.find((map) => map.id === activeId) ?? null, [maps, activeId])

  const handleUse = async (
    blob: Blob,
    size: { width: number; height: number },
    seed: number,
    params: WorldMapParams,
    view: MapView,
  ): Promise<void> => {
    if (!active) return
    const saved = await saveMapImage(blob, {
      name: active.name,
      fileName: mapViewFileName(active.name, view),
      replace: true,
    })
    await setMapBackground(
      active.id,
      saved.relPath,
      {
        width: saved.width > 0 ? saved.width : size.width,
        height: saved.height > 0 ? saved.height : size.height,
      },
      { seed, params, view },
    )
    await reload()
    notifyDataUpdated()
    toast.success('已设为底图', { description: active.name })
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><span className={LOADING_TEXT}>加载中…</span></div>
  }

  if (maps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <MapPin size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">先在「地图」里新建一张</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-ink-faint">目标地图</span>
        {maps.map((map) => {
          const selected = map.id === active?.id
          return (
            <button
              key={map.id}
              type="button"
              onClick={() => setActiveId(map.id)}
              aria-pressed={selected}
              className={`${CHIP} ${ROUND_ITEM} ${
                selected
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
            >
              {map.name}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1">
        {/* 生成器没有地图库下拉：目标得写出来，否则用户不知道这一版写到哪张图上 */}
        <MapGeneratorPanel onUseAsBackground={handleUse} mapName={active?.name} />
      </div>
    </div>
  )
}
