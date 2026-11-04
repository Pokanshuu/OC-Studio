'use client'

/**
 * 地图视图（W3）：**地图是实体（笔记）**，锚点挂在其它实体上。
 *
 * 数据口径：
 * - 一张地图 = 一条 `category: 地图` 的笔记，底图路径与像素尺寸存在它自己的 frontmatter
 *   （`map_image` / `map_width` / `map_height`）
 * - 实体锚点存 `map_position`（归一化 0–1）+ `map_id`（**地图名字**，因为 id 只在本次会话有效）
 * - 拖动锚点 = 写回实体，不新建任何表
 *
 * 版式：与列表页同一个 48px 页头（`TOOLBAR` 的形态），移动端折成两行、不粘顶；
 * 锚点是压在图上的小圆角标签（不是胶囊），移动端只读。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageDown, MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MapGeneratorPanel } from './MapGeneratorPanel'
import type { WorldMapParams } from '@/plugins/map-generator'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useDevice } from '@/lib/use-device'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  CENTER_STATE,
  LOADING_TEXT,
} from '@/lib/ui-tokens'
import { notifyDataUpdated } from '@/lib/data-events'
import { MapAnchorPicker, type MapAnchorSelection } from './components/MapAnchorPicker'
import { MapCanvas } from './components/MapCanvas'
import { MapLayerMenu } from './components/MapLayerMenu'
import { MapManager } from './components/MapManager'
import { deleteMapImage, readMapImageBlob, saveMapImage } from './assets'
import { exportMapPng } from './export'
import {
  createMap,
  listAnchors,
  listMaps,
  setAnchor,
  setMapBackground,
  MAP_ASSET_DIR,
  type AnchorKind,
  type AnchorPoint,
  type MapEntity,
} from './services'
import { DEFAULT_MAP_LAYERS, type MapAnchor, type MapLayerKind, type MapLayerState } from './types'

const NAV_TYPE: Record<AnchorKind, string> = {
  country: 'country',
  event: 'event',
  worldEntry: 'world',
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

export function MapView() {
  const [maps, setMaps] = useState<MapEntity[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [points, setPoints] = useState<AnchorPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'draw' | 'generate'>('draw')
  const [layers, setLayers] = useState<MapLayerState[]>(() =>
    DEFAULT_MAP_LAYERS.map((layer) => ({ ...layer })),
  )
  const [anchorPickerOpen, setAnchorPickerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const activeIdRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { isMobile } = useDevice()
  const { activeItem } = useNavigation()
  const { setConfig } = useMobilePageHeader()
  const { navigateToEntity } = useEntityNavigate()

  useEffect(() => {
    if (!isMobile) return
    setConfig(activeItem === '地图' ? '地图' : null)
  }, [isMobile, activeItem, setConfig])

  const active = maps.find((map) => map.id === activeId) ?? maps[0] ?? null
  const activeName = active?.name ?? ''

  const reload = useCallback(async (keepId?: number | null) => {
    try {
      const [list, groups] = await Promise.all([listMaps(), listAnchors()])
      setMaps(list)
      const current = activeIdRef.current
      const next =
        keepId !== undefined
          ? keepId
          : current !== null && list.some((map) => map.id === current)
            ? current
            : (list[0]?.id ?? null)
      activeIdRef.current = next
      setActiveId(next)

      const all: AnchorPoint[] = []
      for (const [, items] of groups) all.push(...items)
      setPoints(all)
    } catch (err) {
      console.error('[map] 读取地图失败', err)
      setMaps([])
      setPoints([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏读地图与锚点；setState 在异步回调里
    void reload()
  }, [reload])

  const selectMap = useCallback((id: number | null) => {
    activeIdRef.current = id
    setActiveId(id)
  }, [])

  /** 空 map_id 的锚点先都算在当前地图上；一旦拖动就归属到这张图 */
  const visible = useMemo(
    () => points.filter((point) => point.mapId === '' || point.mapId === activeName),
    [points, activeName],
  )

  const shown = useMemo(
    () =>
      visible.filter((point) => layers.some((layer) => layer.kind === point.kind && layer.visible)),
    [visible, layers],
  )

  const allLayersOff = layers.every((layer) => !layer.visible)

  const handleToggleLayer = (kind: MapLayerKind) => {
    setLayers((previous) =>
      previous.map((layer) => (layer.kind === kind ? { ...layer, visible: !layer.visible } : layer)),
    )
  }

  const handleEnableAllLayers = () => {
    setLayers((previous) => previous.map((layer) => ({ ...layer, visible: true })))
  }

  const handleCreate = async () => {
    try {
      const id = await createMap()
      await reload(id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('新建地图失败', { description: messageOf(err) })
    }
  }

  const handleGenerated = async (
    blob: Blob,
    size: { width: number; height: number },
    seed: number,
    params: WorldMapParams,
  ) => {
    if (!active) return
    const saved = await saveMapImage(blob, { name: active.name })
    await setMapBackground(
      active.id,
      saved.relPath,
      {
        width: saved.width > 0 ? saved.width : size.width,
        height: saved.height > 0 ? saved.height : size.height,
      },
      { seed, params },
    )
    await reload(active.id)
    notifyDataUpdated()
    setMode('draw')
  }

  /** 上传器给的是路径；底图必须重新落进 `.ocstudio/maps/`，所以先读回字节 */
  const handleBackground = async (path: string) => {
    if (!active) return
    try {
      const blob = await readMapImageBlob(path)
      const saved = await saveMapImage(blob, { name: active.name })
      await setMapBackground(active.id, saved.relPath, {
        width: saved.width,
        height: saved.height,
      })
      await reload(active.id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('设置底图失败', { description: messageOf(err) })
    }
  }

  /** 空态里的「设置底图」直接拿文件字节，不必先落临时文件再读回 */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !active) return
    try {
      const saved = await saveMapImage(file, { name: active.name })
      await setMapBackground(active.id, saved.relPath, {
        width: saved.width,
        height: saved.height,
      })
      await reload(active.id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('设置底图失败', { description: messageOf(err) })
    }
  }

  const handleRemoveBackground = async () => {
    if (!active) return
    const previous = active.image
    try {
      await setMapBackground(active.id, null)
      // 只清理 .ocstudio/maps/ 下、且没有别的地图在引用的文件
      const normalized = (previous ?? '').replace(/\\/g, '/')
      if (normalized.startsWith(`${MAP_ASSET_DIR}/`)) {
        const others = await listMaps()
        if (!others.some((map) => map.id !== active.id && map.image === previous)) {
          await deleteMapImage(previous ?? '').catch((err: unknown) => {
            console.warn('[map] 删除旧底图失败', err)
          })
        }
      }
      await reload(active.id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('移除底图失败', { description: messageOf(err) })
    }
  }

  const handleAddAnchor = async (selection: MapAnchorSelection) => {
    if (!active) return
    try {
      await setAnchor(selection.kind, selection.id, { x: 0.5, y: 0.5 }, active.name)
      await reload(active.id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('添加锚点失败', { description: messageOf(err) })
    }
  }

  const handleRemoveAnchor = async (point: AnchorPoint) => {
    try {
      await setAnchor(point.kind, point.id, null)
      await reload(activeIdRef.current)
      notifyDataUpdated()
    } catch (err) {
      toast.error('移除锚点失败', { description: messageOf(err) })
    }
  }

  /** 拖动过程只改本地；松手才写回实体（避免每个 pointermove 都落一次盘） */
  const handleMoveAnchor = useCallback(
    (point: AnchorPoint, anchor: MapAnchor) => {
      setPoints((previous) =>
        previous.map((item) =>
          item.kind === point.kind && item.id === point.id
            ? { ...item, anchor, mapId: activeName }
            : item,
        ),
      )
    },
    [activeName],
  )

  const handleCommitAnchor = useCallback(
    async (point: AnchorPoint, anchor: MapAnchor) => {
      try {
        await setAnchor(point.kind, point.id, anchor, activeName)
        notifyDataUpdated()
      } catch (err) {
        toast.error('保存锚点失败', { description: messageOf(err) })
        await reload(activeIdRef.current)
      }
    },
    [activeName, reload],
  )

  const handleOpenAnchor = useCallback(
    (point: AnchorPoint) => {
      navigateToEntity(point.id, NAV_TYPE[point.kind])
    },
    [navigateToEntity],
  )

  const handleExport = async () => {
    if (!active?.image) return
    const safeName = active.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || '地图'
    setExporting(true)
    try {
      await exportMapPng(
        { image: active.image, width: active.width, height: active.height },
        shown.map((point) => ({
          x: point.anchor.x,
          y: point.anchor.y,
          title: point.title,
          kind: point.kind,
        })),
        { fileName: `地图-${safeName}.png` },
      )
    } catch (err) {
      toast.error('导出失败', { description: messageOf(err) })
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className={CENTER_STATE}>
        <span className={LOADING_TEXT}>加载中…</span>
      </div>
    )
  }

  if (maps.length === 0) {
    return (
      <div className={CENTER_STATE}>
        <MapPin size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">还没有地图</p>
        <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
          <Plus size={14} strokeWidth={2} />
          新建地图
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="md:hidden h-[calc(60px+var(--safe-top))] shrink-0" aria-hidden />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />

      <PageToolbar
        title="地图"
        className="max-md:h-auto max-md:flex-wrap max-md:gap-2 max-md:py-2 md:px-6"
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'draw' ? 'generate' : 'draw')}
              className={mode === 'generate' ? BTN_PRIMARY : BTN_QUIET}
            >
              {mode === 'generate' ? '回到画布' : '生成地图'}
            </button>
            <ImageUploader
              value={active?.image}
              aspectRatio="16:9"
              cropAspect={16 / 9}
              placeholderText="设置底图"
              size="sm"
              onChange={(path) => void handleBackground(path)}
              onRemove={() => void handleRemoveBackground()}
            />
            <button
              type="button"
              onClick={() => setAnchorPickerOpen(true)}
              disabled={!active}
              className={`${BTN_QUIET} disabled:opacity-40`}
            >
              <MapPin size={14} strokeWidth={2} />
              添加锚点
            </button>
            <MapLayerMenu layers={layers} onToggle={handleToggleLayer} disabled={!active} />
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!active?.image || exporting}
              className={`${BTN_QUIET} disabled:opacity-40`}
            >
              <ImageDown size={14} strokeWidth={2} />
              {exporting ? '导出中…' : '导出图片'}
            </button>
          </div>
        }
      >
        <MapManager
          activeMapId={active?.id ?? null}
          onSelect={selectMap}
          onChanged={() => void reload()}
        />
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">{shown.length} 个锚点</span>
      </PageToolbar>

      {mode === 'generate' ? (
        <div className="min-h-0 flex-1 px-4 pb-6 pt-3 md:px-6 md:pt-0">
          <MapGeneratorPanel onUseAsBackground={handleGenerated} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-4 pb-6 pt-3 md:px-6 md:pt-0">
          {active ? (
            <MapCanvas
              map={active}
              points={shown}
              totalOnMap={visible.length}
              allLayersOff={allLayersOff}
              onMoveAnchor={handleMoveAnchor}
              onCommitAnchor={handleCommitAnchor}
              onRemoveAnchor={handleRemoveAnchor}
              onOpenAnchor={handleOpenAnchor}
              onAddAnchor={() => setAnchorPickerOpen(true)}
              onEnableAllLayers={handleEnableAllLayers}
              onPickBackground={() => fileInputRef.current?.click()}
            />
          ) : null}
        </div>
      )}

      <MapAnchorPicker
        open={anchorPickerOpen}
        mapName={activeName}
        onClose={() => setAnchorPickerOpen(false)}
        onSelect={(selection) => void handleAddAnchor(selection)}
      />
    </div>
  )
}
