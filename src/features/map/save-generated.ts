'use client'

/**
 * 「生成结果落成一张地图的底图」—— 两个入口共用：地图里的生成器、工具页的生成器。
 *
 * 两次提交的差别只在**写到哪张图**（既有 / 新建），落盘这一步完全一样：
 *
 * 1. 当前档先存 `<地图名>-<视图>.png`，再写 `map_image` / `map_seed` / `map_params` / `map_mode`
 * 2. 其余五档**现在就画完存盘** —— 切档只是换个路径，不用再等 Worker 重画几秒
 * 3. 单档失败不连坐：存下来的那几档照样能切，缺的那档切过去时再补（见 MapView 的切档）
 *
 * 谁新建地图、谁负责 reload / 导航，都留给调用方 —— 这里只碰文件与地图笔记本身。
 */
import { MAP_VIEW_LABELS, type MapView, type WorldMapParams } from '@/plugins/map-generator'
import { mapViewFileName, saveMapImage } from './assets'
import { renderMapView } from './render-view'
import { setMapBackground } from './services'

/**
 * 生成地图的六档视图（控制条上的档位、预渲染、导出共用这一份）。
 *
 * **不含 `profile`**：剖面是抽屉（沿一条线取高度剖面），不是一张满屏底图 ——
 * 切过去会把整张地图换成一条剖面图，那不是控制条该干的事。
 */
export const MAP_VIEWS: readonly MapView[] = [
  'terrain',
  'contour',
  'temperature',
  'moisture',
  'biome',
  'political',
]

export interface SaveGeneratedMapOptions {
  /** 写到哪张地图 */
  mapId: number
  /** 地图名 —— 底图文件按它命名，必须是**去重后**的最终名字 */
  mapName: string
  /** 当前档的 PNG */
  blob: Blob
  size: { width: number; height: number }
  seed: number
  params: WorldMapParams
  /** 当前档 */
  view: MapView
  /** 其余五档的渲染进度（阶段 + 0–1） */
  onProgress?: (stage: string, value: number) => void
}

/** 把生成结果写成这张地图的底图（含其余五档的预渲染） */
export async function saveGeneratedMap({
  mapId,
  mapName,
  blob,
  size,
  seed,
  params,
  view,
  onProgress,
}: SaveGeneratedMapOptions): Promise<void> {
  const saved = await saveMapImage(blob, {
    name: mapName,
    // 生成出来的第一张也按「地图名 + 视图」命名，视图条才能原地覆盖而不是越攒越多
    fileName: mapViewFileName(mapName, view),
    replace: true,
  })
  await setMapBackground(
    mapId,
    saved.relPath,
    {
      width: saved.width > 0 ? saved.width : size.width,
      height: saved.height > 0 ? saved.height : size.height,
    },
    { seed, params, view },
  )

  const others = MAP_VIEWS.filter((item) => item !== view)
  for (let index = 0; index < others.length; index += 1) {
    const next = others[index]
    onProgress?.(`渲染 ${MAP_VIEW_LABELS[next]}`, index / others.length)
    try {
      const png = await renderMapView({ seed, params, view: next })
      await saveMapImage(png, {
        name: mapName,
        fileName: mapViewFileName(mapName, next),
        replace: true,
      })
    } catch (err) {
      console.warn('[map] 预渲染视图失败', next, err)
    }
  }
  onProgress?.('', 1)
}
