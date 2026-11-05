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
import { Activity, Layers, MapPin, Maximize2, Minimize2, Palette, PenLine, Plus, Route, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { RELATION_COLORS, relationColorValue } from '@/lib/relation-colors'
import { MapGeneratorPanel } from './MapGeneratorPanel'
import {
  normalizeMapParams,
  type MapView as MapViewKind,
  type ProfilePoint,
  type WorldMapParams,
} from '@/plugins/map-generator'


import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useDevice } from '@/lib/use-device'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  CENTER_STATE,
  LOADING_TEXT,
  MENU_ITEM,
} from '@/lib/ui-tokens'
import { notifyDataUpdated } from '@/lib/data-events'
import { MapAnchorPicker, type MapAnchorSelection } from './components/MapAnchorPicker'
import { MapCanvas, type AnnotationDraft } from './components/MapCanvas'
import { MapLibraryDialog } from './components/MapLibraryDialog'
import { MapModeCard } from './components/MapModeCard'
import { MapLegend } from './components/MapLegend'
import { ProfileDrawer } from './components/ProfileDrawer'
import { MapSwitcher } from './components/MapSwitcher'
import { MapViewStrip } from './components/MapViewStrip'
import { deleteMapImage, mapViewFileName, saveMapImage } from './assets'
import {
  ANNOTATION_LABELS,
  annotationAt,
  minPoints,
  newAnnotationId,
  parseAnnotations,
  stringifyAnnotations,
  type AnnotationKind,
  type AnnotationPoint,
  type MapAnnotation,
} from './annotations'
import { exportMapPng } from './export'
import { renderMapProfile, renderMapView } from './render-view'
import {
  createMap,
  deleteMap,
  listAnchors,
  renameMap,
  listMaps,
  setAnchor,
  setMapBackground,
  setMapAnnotations,
  setMapView,
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

/**
 * 视图条上的档位。
 *
 * 不含 `profile`：剖面是**抽屉**（沿一条线取高度剖面），不是一张满屏底图，
 * 切过去会把整张地图换成一条剖面图，那不是这个条要干的事。
 */
const VIEWS: readonly MapViewKind[] = [
  'terrain',
  'contour',
  'temperature',
  'moisture',
  'biome',
  'political',
]

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
  /** 查看 / 编辑：默认查看，记住上次选择（`oc-map-mode`） */
  const [mapMode, setMapMode] = useState<'view' | 'edit'>(() => {
    if (typeof window === 'undefined') return 'view'
    return localStorage.getItem('oc-map-mode') === 'edit' ? 'edit' : 'view'
  })
  const toggleMapMode = (): void => {
    const next = mapMode === 'view' ? 'edit' : 'view'
    setMapMode(next)
    localStorage.setItem('oc-map-mode', next)
  }
  const [layers, setLayers] = useState<MapLayerState[]>(() =>
    DEFAULT_MAP_LAYERS.map((layer) => ({ ...layer })),
  )
  const [anchorPickerOpen, setAnchorPickerOpen] = useState(false)
  const [layerCardOpen, setLayerCardOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  /** 整屏地图：把页面壳让出来，只留画布与浮层 */
  const [immersive, setImmersive] = useState(false)
  const [exporting, setExporting] = useState(false)
  /** 正在换视图：档位暂时不可点，进度给视图条底那条细线 */
  const [switching, setSwitching] = useState(false)
  const [switchProgress, setSwitchProgress] = useState<number | null>(null)
  /** 正在画的标注（国界 / 道路） */
  const [draft, setDraft] = useState<AnnotationDraft | null>(null)
  /** 同一条线骨骼用来画标注还是取剖面 */
  const [draftPurpose, setDraftPurpose] = useState<'annotation' | 'profile'>('annotation')
  /** 剖面：抽屉里的数据（`null` = 没取过，抽屉关着） */
  const [profile, setProfile] = useState<{ points: ProfilePoint[]; lengthKm: number } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileProgress, setProfileProgress] = useState<{ stage: string; value: number } | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  /** 空白处右键的菜单：`target` 非空表示右键落在已有标注上 */
  const [canvasMenu, setCanvasMenu] = useState<{
    at: { x: number; y: number }
    anchor: MapAnchor
    target: MapAnnotation | null
  } | null>(null)
  /** 国界填充色的小面板：右键国界 →「填充色」 */
  const [fillMenu, setFillMenu] = useState<{ target: MapAnnotation; at: { x: number; y: number } } | null>(null)

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

  // 离开地图分区时把浮层收掉：添加锚点挂在 #overlay-root 上，
  // 不主动关会跟着用户飘到别的页面（截图里就是它一直留在屏幕中间）。
  useEffect(() => {
    if (activeItem === '地图') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 离开分区就得把浮层收回闭合态，这个值没有可派生的来源
    setAnchorPickerOpen(false)
    setLayerCardOpen(false)
    setSwitcherOpen(false)
    setLibraryOpen(false)
    setImmersive(false)
    setCanvasMenu(null)
    setDraft(null)
  }, [activeItem])

  // Esc 退出整屏；画线中先交给画线的 Esc，不抢
  useEffect(() => {
    if (!immersive) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && draft === null) setImmersive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, draft])

  // 状态栏在内容区之外，fixed 画布盖不到它；整屏时先在 body 上挂个标记把它藏掉
  useEffect(() => {
    if (!immersive) return
    document.body.dataset.mapImmersive = 'true'
    return () => {
      delete document.body.dataset.mapImmersive
    }
  }, [immersive])

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

  /**
   * 地图库里每张图的锚点数：`map_id` 存的是名字。
   * 空 `map_id` 是旧数据 / 从没拖过的锚点，它们显示在当前地图上，但不属于任何一张，
   * 所以单独报一个「未归属」，不硬塞进某张图的计数里。
   */
  const anchorStats = useMemo(() => {
    const counts = new Map<string, number>()
    let unassigned = 0
    for (const point of points) {
      if (point.mapId === '') {
        unassigned += 1
        continue
      }
      counts.set(point.mapId, (counts.get(point.mapId) ?? 0) + 1)
    }
    return { counts, unassigned }
  }, [points])

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
    view: MapViewKind,
  ) => {
    if (!active) return
    const saved = await saveMapImage(blob, {
      name: active.name,
      // 生成出来的第一张也按「地图名 + 视图」命名，视图条才能原地覆盖而不是越攒越多
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
    await reload(active.id)
    notifyDataUpdated()
    setMode('draw')
  }

  /**
   * 切视图（方案 A）：用存下的种子 + 参数重画这一档，落成
   * `.ocstudio/maps/<地图>-<视图>.png` 再指过去。
   *
   * 每次都重画而不是查缓存文件：参数可能被重新生成改过，只有「种子 + 参数」
   * 才能保证屏幕上这一档与当初看到的一致；文件名固定所以磁盘上不会堆积。
   */
  const handleSwitchView = async (view: MapViewKind) => {
    if (!active || switching) return
    if (active.mode === view) return
    if (!active.params) return

    let params: WorldMapParams
    try {
      params = normalizeMapParams(JSON.parse(active.params) as WorldMapParams)
    } catch {
      toast.error('这张地图没有可用的生成参数')
      return
    }

    setSwitching(true)
    setSwitchProgress(null)
    try {
      const blob = await renderMapView({
        seed: active.seed ?? 0,
        params,
        view,
        onProgress: (_stage, value) => setSwitchProgress(value),
      })
      setSwitchProgress(1)
      const saved = await saveMapImage(blob, {
        name: active.name,
        fileName: mapViewFileName(active.name, view),
        replace: true,
      })
      await setMapView(active.id, view, saved.relPath)
      await reload(active.id)
      notifyDataUpdated()
    } catch (err) {
      toast.error('切换视图失败', { description: messageOf(err) })
    } finally {
      setSwitching(false)
      setSwitchProgress(null)
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

  /** 当前地图的政治标注（JSON → 结构）；坏数据当空，不会把界面弄崩 */
  const annotations = useMemo(() => parseAnnotations(active?.annotations), [active?.annotations])

  const persistAnnotations = useCallback(
    async (next: MapAnnotation[]) => {
      if (!active) return
      try {
        await setMapAnnotations(active.id, stringifyAnnotations(next))
        await reload(active.id)
        notifyDataUpdated()
      } catch (err) {
        toast.error('保存标注失败', { description: messageOf(err) })
        await reload(activeIdRef.current)
      }
    },
    [active, reload],
  )

  const handleCanvasContextMenu = useCallback(
    (anchor: MapAnchor, at: { x: number; y: number }) => {
      // 落在已有标注上就只给「删除」，否则给画线的两个入口
      setCanvasMenu({ at, anchor, target: annotationAt(annotations, anchor) })
    },
    [annotations],
  )

  const startDraft = (kind: AnnotationKind) => {
    const origin = canvasMenu?.anchor
    setCanvasMenu(null)
    setDraftPurpose('annotation')
    setDraft({ kind, points: origin ? [{ x: origin.x, y: origin.y }] : [] })
  }

  /**
   * 沿两点取剖面。与切视图同一份快照（种子 + 参数），所以剖面和屏幕上那张图
   * 一定是同一片地形；采样整片图层，不需要再画一遍像素。
   */
  const runProfile = async (a: AnnotationPoint, b: AnnotationPoint) => {
    if (!active || !active.params) return
    let params: WorldMapParams
    try {
      params = normalizeMapParams(JSON.parse(active.params) as WorldMapParams)
    } catch {
      toast.error('这张地图没有可用的生成参数')
      return
    }
    setProfileLoading(true)
    setProfileProgress(null)
    setProfileError(null)
    try {
      const result = await renderMapProfile({
        seed: active.seed ?? 0,
        params,
        line: { ax: a.x, ay: a.y, bx: b.x, by: b.y },
        onProgress: (stage, value) => setProfileProgress({ stage, value }),
      })
      setProfile({ points: result.points, lengthKm: result.lengthKm })
    } catch (err) {
      setProfileError(messageOf(err))
    } finally {
      setProfileLoading(false)
      setProfileProgress(null)
    }
  }

  const startProfile = () => {
    const origin = canvasMenu?.anchor
    setCanvasMenu(null)
    setDraftPurpose('profile')
    setDraft({ kind: 'road', points: origin ? [{ x: origin.x, y: origin.y }] : [] })
  }

  const handleDraftPoint = (anchor: MapAnchor) => {
    if (!draft) return
    const point = { x: anchor.x, y: anchor.y }
    const points = [...draft.points, point]
    if (draftPurpose === 'profile' && points.length >= 2) {
      setDraft(null)
      void runProfile(points[0], points[1])
      return
    }
    setDraft({ ...draft, points })
  }

  const finishDraft = async () => {
    if (!draft || draftPurpose !== 'annotation') return
    const need = minPoints(draft.kind)
    if (draft.points.length < need) {
      toast.error(`${ANNOTATION_LABELS[draft.kind]}至少要 ${need} 个点`)
      return
    }
    const next: MapAnnotation[] = [
      ...annotations,
      { id: newAnnotationId(), kind: draft.kind, points: draft.points },
    ]
    setDraft(null)
    await persistAnnotations(next)
  }

  const deleteAnnotation = async (target: MapAnnotation) => {
    setCanvasMenu(null)
    await persistAnnotations(annotations.filter((item) => item.id !== target.id))
  }

  /** 给国界换填充色；`undefined` = 去掉填充（回到淡墨底） */
  const setAnnotationFill = async (target: MapAnnotation, fill: string | undefined): Promise<void> => {
    setFillMenu(null)
    await persistAnnotations(
      annotations.map((item) => (item.id === target.id ? { ...item, fill } : item)),
    )
  }

  // 画线中途按 Esc 退出；不抢别处的 Esc（菜单自己管自己的）
  useEffect(() => {
    if (!draft) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDraft(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft])

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

  const menuTarget = canvasMenu?.target ?? null
  const canvasMenuItems = [
    // 已有标注压在最上面，但**不替换**画线入口：国界是多边形，右键落在面里是常态
    ...(menuTarget
      ? [
          ...(menuTarget.kind === 'border'
            ? [
                {
                  label: menuTarget.fill ? `填充色：${menuTarget.fill}` : '填充色...',
                  icon: <Palette size={13} strokeWidth={2} />,
                  onSelect: () => {
                    if (canvasMenu) setFillMenu({ target: menuTarget, at: canvasMenu.at })
                  },
                },
              ]
            : []),
          {
            label: `删除${ANNOTATION_LABELS[menuTarget.kind]}`,
            danger: true,
            icon: <Trash2 size={13} strokeWidth={2} />,
            onSelect: () => void deleteAnnotation(menuTarget),
          },
        ]
      : []),
    {
      label: '画国界',
      icon: <PenLine size={13} strokeWidth={2} />,
      onSelect: () => startDraft('border'),
    },
    {
      label: '画道路',
      icon: <Route size={13} strokeWidth={2} />,
      onSelect: () => startDraft('road'),
    },
    {
      label: '取地形剖面',
      icon: <Activity size={13} strokeWidth={2} />,
      onSelect: () => startProfile(),
    },
  ]

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
    <div className={`flex h-full min-h-0 flex-col ${immersive ? 'fixed inset-0 z-40 bg-paper' : ''}`}>
      <div className="md:hidden h-[calc(60px+var(--safe-top))] shrink-0" aria-hidden />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />
      <div className="relative h-full w-full overflow-hidden">
        {mode === 'generate' ? (
          <div className="absolute inset-0 overflow-y-auto px-4 pb-6 pt-16 md:overflow-hidden md:px-6">
            <MapGeneratorPanel onUseAsBackground={handleGenerated} />
          </div>
        ) : active ? (
          <MapCanvas
            map={active}
            points={shown}
            allLayersOff={allLayersOff}
            onMoveAnchor={handleMoveAnchor}
            onCommitAnchor={handleCommitAnchor}
            onRemoveAnchor={handleRemoveAnchor}
            onOpenAnchor={handleOpenAnchor}
            onAddAnchor={() => setAnchorPickerOpen(true)}
            onEnableAllLayers={handleEnableAllLayers}
            onPickBackground={() => fileInputRef.current?.click()}
            readOnly={mapMode === 'view'}
            annotations={annotations}
            draft={draft}
            onDraftPoint={handleDraftPoint}
            onCanvasContextMenu={handleCanvasContextMenu}
            bleed
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-ink-muted">还没有地图，左上角新建一张</p>
          </div>
        )}

        {/* 顶部浮层：地图名 + 查看 / 编辑 */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-control border border-line bg-paper/85 px-2.5 py-1 backdrop-blur-lg float-shadow">
            <span className="truncate text-[13px] text-ink">{active?.name ?? '地图'}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{shown.length} 个锚点</span>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setImmersive((previous) => !previous)}
              className={BTN_QUIET}
              title={immersive ? '退出全屏' : '全屏'}
              aria-label={immersive ? '退出全屏' : '全屏'}
            >
              {immersive ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
            </button>
            {mode === 'generate' ? (
              <button type="button" onClick={() => setMode('draw')} className={BTN_QUIET}>
                回到画布
              </button>
            ) : null}
            {mode === 'draw' ? (
              <button
                type="button"
                onClick={toggleMapMode}
                className={mapMode === 'edit' ? BTN_PRIMARY : BTN_QUIET}
              >
                {mapMode === 'edit' ? '完成' : '编辑地图'}
              </button>
            ) : null}
          </div>
        </div>

        {/* 地图选择器（天气那种卡片列表），从头像卡片顶部的箭头打开 */}
        {switcherOpen ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30">
            <MapSwitcher
              maps={maps}
              activeId={active?.id ?? null}
              onSelect={(id) => {
                selectMap(id)
                setSwitcherOpen(false)
              }}
              onCreate={() => { void handleCreate(); setSwitcherOpen(false) }}
              onRename={(id, name) => {
                void renameMap(id, name).then(() => reload())
              }}
              onDelete={(id) => {
                void deleteMap(id).then(() => reload())
              }}
              onOpenLibrary={() => {
                setSwitcherOpen(false)
                setLibraryOpen(true)
              }}
              onClose={() => setSwitcherOpen(false)}
            />
          </div>
        ) : null}
        {libraryOpen ? (
          <MapLibraryDialog
            maps={maps}
            activeId={active?.id ?? null}
            anchorCounts={anchorStats.counts}
            unassignedAnchors={anchorStats.unassigned}
            onClose={() => setLibraryOpen(false)}
            onSelect={(id) => {
              selectMap(id)
              setLibraryOpen(false)
            }}
            onCreate={async () => {
              await handleCreate()
              setLibraryOpen(false)
            }}
            onRename={async (id, name) => {
              await renameMap(id, name)
              await reload()
            }}
            onDelete={async (id) => {
              await deleteMap(id)
              await reload()
            }}
          />
        ) : null}
        {/* 左下浮层：图层 / 操作（编辑态才有操作） */}
        {mode === 'draw' ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20">
            {layerCardOpen ? (
              <MapModeCard
                layers={layers}
                onToggleLayer={handleToggleLayer}
                onClose={() => setLayerCardOpen(false)}
                canEdit={mapMode === 'edit'}
                hasMap={Boolean(active)}
                hasImage={Boolean(active?.image)}
                exporting={exporting}
                onAddAnchor={() => setAnchorPickerOpen(true)}
                onPickBackground={() => fileInputRef.current?.click()}
                onRemoveBackground={() => void handleRemoveBackground()}
                onGenerate={() => setMode('generate')}
                onExport={() => void handleExport()}
                mapName={active?.name ?? '地图'}
                onOpenSwitcher={() => {
                  setLayerCardOpen(false)
                  setSwitcherOpen(true)
                }}
                onOpenLibrary={() => {
                  setLayerCardOpen(false)
                  setSwitcherOpen(false)
                  setLibraryOpen(true)
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setLayerCardOpen(true)}
                className="pointer-events-auto flex h-9 items-center gap-2 rounded-panel border border-line bg-paper/85 px-3 text-[13px] text-ink backdrop-blur-lg float-shadow transition-colors hover:bg-[var(--oc-hover)]"
              >
                <Layers size={15} strokeWidth={2} />
                图层
              </button>
            )}
          </div>
        ) : null}
        {/* 没有底图时，生成器是一级入口：藏在「编辑态 › 图层 › 生成地图」三层里没人找得到 */}
        {mode === 'draw' && active && !active.image ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
            <button
              type="button"
              onClick={() => setMode('generate')}
              className={`${BTN_PRIMARY} pointer-events-auto`}
            >
              <Wand2 size={14} strokeWidth={2} />
              生成地图
            </button>
          </div>
        ) : null}
        {/* 视图条：只有生成过的地图才有（手传底图没有可重画的快照） */}
        {mode === 'draw' && active?.image && active.params && active.seed !== undefined ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 md:block">
            <MapViewStrip
              views={VIEWS}
              active={active.mode ?? 'terrain'}
              busy={switching}
              progress={switchProgress}
              onSelect={(view) => void handleSwitchView(view)}
            />
          </div>
        ) : null}
        {/* 图例：压在左下、图层按钮上方。没有它那几张色块图就是无名颜色 */}
        {mode === 'draw' && active?.image && !draft ? (
          <div className="pointer-events-none absolute bottom-14 left-3 z-10 hidden md:block">
            <MapLegend view={active.mode ?? 'terrain'} />
          </div>
        ) : null}
        {/* 画线中：计数 + 完成 / 取消（不放说明文字，按钮自己会说） */}
        {draft ? (
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5">
            <span className="pointer-events-auto rounded-control border border-line bg-paper/85 px-2.5 py-1 text-[12px] tabular-nums text-ink backdrop-blur-lg float-shadow">
              {draftPurpose === 'profile' ? '剖面' : ANNOTATION_LABELS[draft.kind]} · {draft.points.length}
            </span>
            {draftPurpose === 'annotation' ? (
              <button
                type="button"
                onClick={() => void finishDraft()}
                className={`${BTN_PRIMARY} pointer-events-auto`}
              >
                完成绘制
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDraft(null)}
              className={`${BTN_QUIET} pointer-events-auto`}
            >
              取消
            </button>
          </div>
        ) : null}
      </div>
      {profile || profileLoading || profileError ? (
        <ProfileDrawer
          points={profile?.points ?? []}
          lengthKm={profile?.lengthKm ?? 0}
          loading={profileLoading}
          progress={profileProgress}
          error={profileError}
          onClose={() => {
            setProfile(null)
            setProfileError(null)
          }}
        />
      ) : null}
      <MapAnchorPicker
        open={anchorPickerOpen}
        mapName={activeName}
        onClose={() => setAnchorPickerOpen(false)}
        onSelect={(selection) => void handleAddAnchor(selection)}
      />
      {canvasMenu ? (
        <MediaContextMenu at={canvasMenu.at} onClose={() => setCanvasMenu(null)} items={canvasMenuItems} />
      ) : null}
      {fillMenu ? (
        <MenuSurface
          at={fillMenu.at}
          onClose={() => setFillMenu(null)}
          width={200}
          ariaLabel="国界填充色"
        >
          <button
            type="button"
            onClick={() => void setAnnotationFill(fillMenu.target, undefined)}
            className={`${MENU_ITEM} justify-between`}
          >
            <span>无填充</span>
            {!fillMenu.target.fill ? <span className="text-[11px] text-ink-faint">当前</span> : null}
          </button>
          <div className="grid grid-cols-6 gap-1.5 px-3 py-2">
            {RELATION_COLORS.map((color) => {
              const active = fillMenu.target.fill === color.name
              return (
                <button
                  key={color.name}
                  type="button"
                  aria-label={color.name}
                  aria-pressed={active}
                  title={color.name}
                  onClick={() => void setAnnotationFill(fillMenu.target, color.name)}
                  className={`h-5 w-5 rounded-full border transition-colors ${
                    active ? 'border-ink' : 'border-transparent hover:border-line-hover'
                  }`}
                  style={{ backgroundColor: relationColorValue(color.name) }}
                />
              )
            })}
          </div>
        </MenuSurface>
      ) : null}
    </div>
  )
}
