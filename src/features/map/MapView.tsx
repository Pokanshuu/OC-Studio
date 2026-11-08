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
 * 版式（2026-11-06 改版）：整屏画布 + **四个角**，每个角只回答一个问题：
 *   左上「我在看哪张图」/ 左下「我在看什么」/ 右下「我能改什么」/ 右上「模式与输出」。
 * 底部中轴只留一条控制条（图层 + 底图档位），手绘底图没有档位时它自己缩成一枚按钮。
 * 界面按「这张图能做什么」裁剪：导入的底图没有六档、没有图例，这两段整段不渲染。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  Eraser,
  ImageDown,
  Library,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Package,
  PackageOpen,
  Palette,
  PenLine,
  Pencil,
  Plus,
  RotateCcw,
  Route,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { MediaContextMenu, type MediaMenuItem } from '@/components/shared/MediaContextMenu'
import { MapGeneratorPanel } from './MapGeneratorPanel'
import { usePlugins } from '@/lib/plugins'
import { MAP_GENERATOR_PLUGIN } from '@/lib/plugins/official'
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
  FLOAT_BAR,
  FLOAT_BAR_ICON,
  FLOAT_BAR_TEXT,
  FLOAT_SKIN,
  FLOAT_STACK,
  LOADING_TEXT,
  PAGE_TITLE,
} from '@/lib/ui-tokens'
import { notifyDataUpdated } from '@/lib/data-events'
import { MapAnchorPicker, type MapAnchorSelection } from './components/MapAnchorPicker'
import { AnnotationColorMenu } from './components/AnnotationColorMenu'
import { MapCanvas, type AnnotationDraft } from './components/MapCanvas'
import { MapControlBar } from './components/MapControlBar'
import { MapDetailDialog } from './components/MapDetailDialog'
import { MapSwitcher } from './components/MapSwitcher'
import { ProfileDrawer } from './components/ProfileDrawer'
import { useMapViewport } from './hooks/useMapViewport'
import { deleteMapImage, mapImageExists, mapViewFileName, saveMapImage } from './assets'
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
import { exportMapImage } from './export'
import { exportMapArchive, importMapArchiveFile } from './archive-io'
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
// 六档档位与「生成结果落成底图」这一步由生成器与工具页共用，见 save-generated.ts
import { MAP_VIEWS as VIEWS, saveGeneratedMap, type MapViewRenderer } from './save-generated'
import { consumeOpenMapRequest } from './open-request'

const NAV_TYPE: Record<AnchorKind, string> = {
  country: 'country',
  event: 'event',
  worldEntry: 'world',
}

/** 压在画布上的小工具按钮：图标 24 见方，浮条里再嵌一层 */
const TOOL_BTN = `flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink rounded-item`

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

interface MoreMenuOptions {
  hasImage: boolean
  exporting: boolean
  onExport: () => void
  onExportArchive: () => void
  onImportArchive: () => void
  onPickBackground: () => void
  onRemoveBackground: () => void
  /** 地图生成器插件关掉时不给这一项（见 `canGenerate`） */
  onGenerate?: () => void
  onOpenLibrary: () => void
}

/**
 * 右上「⋯」的条目：**点开时才构建**（不在渲染期拼闭包、也不在渲染期读 ref）。
 * 顺序固定为「导出 / 底图 / 生成 / 地图库」，只有「有没有底图」决定哪几项在。
 */
function buildMoreItems(options: MoreMenuOptions): MediaMenuItem[] {
  const items: MediaMenuItem[] = []
  if (options.hasImage) {
    items.push({
      label: options.exporting ? '导出中…' : '导出图片',
      icon: <ImageDown size={13} strokeWidth={2} />,
      onSelect: options.onExport,
    })
    items.push({
      label: '导出地图包',
      icon: <Package size={13} strokeWidth={2} />,
      onSelect: options.onExportArchive,
    })
  }
  items.push({
    label: '导入地图包…',
    icon: <PackageOpen size={13} strokeWidth={2} />,
    onSelect: options.onImportArchive,
  })
  items.push({
    label: options.hasImage ? '更换底图' : '设置底图',
    icon: <Upload size={13} strokeWidth={2} />,
    onSelect: options.onPickBackground,
  })
  if (options.hasImage) {
    items.push({
      label: '移除底图',
      icon: <Eraser size={13} strokeWidth={2} />,
      onSelect: options.onRemoveBackground,
    })
  }
  if (options.onGenerate !== undefined) {
    items.push({
      label: '生成地图',
      icon: <Wand2 size={13} strokeWidth={2} />,
      onSelect: options.onGenerate,
    })
  }
  items.push({
    label: '地图详情',
    icon: <Library size={13} strokeWidth={2} />,
    onSelect: options.onOpenLibrary,
  })
  return items
}

export function MapView() {
  const [maps, setMaps] = useState<MapEntity[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [points, setPoints] = useState<AnchorPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  // 地图生成器是插件：关掉之后**不该还有入口**（空态按钮 / ⋯ 菜单 / 详情页重新生成 / 生成器本身）
  const { enabled: pluginEnabled } = usePlugins()
  const canGenerate = pluginEnabled(MAP_GENERATOR_PLUGIN) && MAP_GENERATOR_PLUGIN.available
  /** 查看 / 编辑：默认查看，记住上次选择（`oc-map-mode`） */
  const [mapMode, setMapMode] = useState<'view' | 'edit'>(() => {
    if (typeof window === 'undefined') return 'view'
    return localStorage.getItem('oc-map-mode') === 'edit' ? 'edit' : 'view'
  })
  const [layers, setLayers] = useState<MapLayerState[]>(() =>
    DEFAULT_MAP_LAYERS.map((layer) => ({ ...layer })),
  )
  const [anchorPickerOpen, setAnchorPickerOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  /** 整屏地图：把页面壳让出来，只留画布与浮层 */
  const [immersive, setImmersive] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  /** 正在换视图：档位暂时不可点，进度给控制条底那条细线 */
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
  /** 国界 / 道路的颜色面板：线条色 + （国界）填充色 */
  const [paintMenu, setPaintMenu] = useState<{ target: MapAnnotation; at: { x: number; y: number } } | null>(null)
  /** 右上「⋯」：低频输出（导出 / 底图 / 生成 / 地图库），条目在点开时构建 */
  const [moreMenu, setMoreMenu] = useState<{
    at: { x: number; y: number }
    items: MediaMenuItem[]
  } | null>(null)
  /** 右下「标注」：画国界 / 画道路 / 取剖面 */
  const [toolMenu, setToolMenu] = useState<{ x: number; y: number } | null>(null)
  /** 生成器的起点：从地图库「重新生成」带过来的种子与参数；`null` = 全新一张 */
  const [generatorPreset, setGeneratorPreset] = useState<{ seed?: number; params?: string } | null>(null)

  const activeIdRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const archiveInputRef = useRef<HTMLInputElement | null>(null)

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
    setSwitcherOpen(false)
    setLibraryOpen(false)
    setImmersive(false)
    setCanvasMenu(null)
    setMoreMenu(null)
    setToolMenu(null)
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

  // 地图列表是浮层：Esc 也能收
  useEffect(() => {
    if (!switcherOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSwitcherOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [switcherOpen])

  const active = maps.find((map) => map.id === activeId) ?? maps[0] ?? null
  const activeName = active?.name ?? ''
  /**
   * 有底图才算是「一张能看的地图」。没有底图时画布只有中间那张空态卡，
   * 四角的浮层（全屏 / 编辑 / ⋯ / 图层 / 缩放）全部不渲染 —— 它们此刻都没有作用对象。
   * 左上那张地图名片留着：它是切换到别的地图 / 新建地图的唯一入口，藏了就出不去。
   */
  const hasBase = Boolean(active?.image)

  // 缩放 / 平移的视口：浮层里的缩放条与画布共用同一个 —— 所以状态提到这里，
  // `MapCanvas` 只负责把 stage 画出来（见 `hooks/useMapViewport` 的 resetKey 说明）。
  const aspectRatio = active?.width && active?.height ? active.width / active.height : 16 / 9
  const viewport = useMapViewport(aspectRatio, active?.id ?? 0)

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

  // 「工具 › 地图生成器」建完图会交棒过来：切到地图时直接打开它，而不是停在上次那张
  useEffect(() => {
    if (activeItem !== '地图') return
    const pending = consumeOpenMapRequest()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性交棒：读的是模块态，没有可派生的值
    if (pending !== null) void reload(pending)
  }, [activeItem, reload])

  const selectMap = useCallback((id: number | null) => {
    activeIdRef.current = id
    setActiveId(id)
    setSwitcherOpen(false)
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

  /**
   * 这张图有没有「底图档位」：只有生成过的地图才有可重画的快照。
   * 导入的底图没有 —— 六档与图例对它是无意义的，整段不渲染。
   */
  const canSwitchView = Boolean(active?.image && active.params && active.seed !== undefined)
  const activeView: MapViewKind =
    active && VIEWS.includes((active.mode ?? 'terrain') as MapViewKind)
      ? ((active.mode ?? 'terrain') as MapViewKind)
      : 'terrain'

  const handleToggleLayer = (kind: MapLayerKind) => {
    setLayers((previous) =>
      previous.map((layer) => (layer.kind === kind ? { ...layer, visible: !layer.visible } : layer)),
    )
  }

  const handleEnableAllLayers = () => {
    setLayers((previous) => previous.map((layer) => ({ ...layer, visible: true })))
  }

  /** 查看 / 编辑：唯一模式开关，入口与出口都在右上角原位 */
  const applyMapMode = (next: 'view' | 'edit'): void => {
    setMapMode(next)
    localStorage.setItem('oc-map-mode', next)
    if (next === 'view') {
      setDraft(null)
      setCanvasMenu(null)
      setToolMenu(null)
      setAnchorPickerOpen(false)
    }
  }

  const toggleMapMode = (): void => {
    applyMapMode(mapMode === 'view' ? 'edit' : 'view')
  }

  const handleCreate = async () => {
    try {
      const id = await createMap()
      await reload(id)
      setSwitcherOpen(false)
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
    onProgress?: (stage: string, value: number) => void,
    renderView?: MapViewRenderer,
  ) => {
    if (!active) return
    // 落盘 + 其余五档的预渲染在 save-generated.ts（工具页那边走的是同一份）
    await saveGeneratedMap({
      mapId: active.id,
      mapName: active.name,
      blob,
      size,
      seed,
      params,
      view,
      renderView,
      onProgress,
    })
    await reload(active.id)
    notifyDataUpdated()
    setGeneratorOpen(false)
  }

  /**
   * 切档：**先看盘上有没有这一档**。
   *
   * 生成时一次存了六张（`<地图>-<视图>.png`），所以正常路径就是换个路径指过去 ——
   * 几百毫秒的读图，不再是几秒的 Worker 重画。
   * 老地图（这次改版之前生成的）只存过切过的那几档：缺哪档就现场补一张，补完同样落盘。
   */
  const handleSwitchView = async (view: MapViewKind) => {
    if (!active || switching) return
    if (active.mode === view) return
    if (!active.params) return

    // 盘上已经有这一档（生成时一次存了六张）→ 只换个路径，**不点亮任何进度**
    const cached = `${MAP_ASSET_DIR}/${mapViewFileName(active.name, view)}`
    if (await mapImageExists(cached)) {
      try {
        await setMapView(active.id, view, cached)
        await reload(active.id)
        notifyDataUpdated()
      } catch (err) {
        toast.error('切换视图失败', { description: messageOf(err) })
      }
      return
    }

    // 缺档（改版前生成的老地图）：现场补一张，这时才需要进度
    setSwitching(true)
    setSwitchProgress(null)
    try {
      let params: WorldMapParams
      try {
        params = normalizeMapParams(JSON.parse(active.params) as WorldMapParams)
      } catch {
        toast.error('这张地图没有可用的生成参数')
        return
      }

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
      // 底图没了四角浮层就撤了，全屏的出口也在里面 —— 顺手退出全屏，别留一个关不掉的整屏
      setImmersive(false)
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
      // 底图没了四角浮层就撤了，全屏的出口也在里面 —— 顺手退出全屏，别留一个关不掉的整屏
      setImmersive(false)
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
      // 底图没了四角浮层就撤了，全屏的出口也在里面 —— 顺手退出全屏，别留一个关不掉的整屏
      setImmersive(false)
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
      // 底图没了四角浮层就撤了，全屏的出口也在里面 —— 顺手退出全屏，别留一个关不掉的整屏
      setImmersive(false)
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

  const startDraft = (kind: AnnotationKind, origin?: MapAnchor) => {
    setCanvasMenu(null)
    setToolMenu(null)
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

  const startProfile = (origin?: MapAnchor) => {
    setCanvasMenu(null)
    setToolMenu(null)
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

  /** 给标注换线条色；`undefined` = 回到默认（固定深墨） */
  const setAnnotationColor = async (target: MapAnnotation, color: string | undefined): Promise<void> => {
    setPaintMenu(null)
    await persistAnnotations(
      annotations.map((item) => (item.id === target.id ? { ...item, color } : item)),
    )
  }

  /** 给国界换填充色；`undefined` = 去掉填充（回到淡墨底） */
  const setAnnotationFill = async (target: MapAnnotation, fill: string | undefined): Promise<void> => {
    setPaintMenu(null)
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

  /** 打开系统文件选择：底图入口有两处（画布空态 / 右上「⋯」），统一走这一个 */
  const pickBackground = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /** 把某一张图导出成图片：锚点取**属于这张图的**（空 `map_id` 的旧锚点也算） */
  const handleExportMap = async (map: MapEntity, format: 'png' | 'jpg' = 'png'): Promise<void> => {
    if (!map.image) return
    const safeName = map.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || '地图'
    setExporting(true)
    try {
      await exportMapImage(
        { image: map.image, width: map.width, height: map.height },
        points
          .filter((point) => point.mapId === '' || point.mapId === map.name)
          .map((point) => ({
            x: point.anchor.x,
            y: point.anchor.y,
            title: point.title,
            kind: point.kind,
          })),
        { fileName: `地图-${safeName}.${format}`, format },
      )
    } catch (err) {
      toast.error('导出失败', { description: messageOf(err) })
    } finally {
      setExporting(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!active) return
    await handleExportMap(active)
  }

  /** 导出 `.ocmap`：底图 + 生成快照 + 标注，拿到的人能接着编辑 */
  const handleExportArchive = async (map: MapEntity): Promise<void> => {
    setExporting(true)
    try {
      await exportMapArchive(map)
    } catch (err) {
      toast.error('导出地图包失败', { description: messageOf(err) })
    } finally {
      setExporting(false)
    }
  }

  /** 导入 `.ocmap`：建一张新地图（重名自动去重），然后切过去 */
  const handleImportArchive = async (file: File): Promise<void> => {
    setImporting(true)
    try {
      const result = await importMapArchiveFile(file)
      await reload(result.id)
      notifyDataUpdated()
      const notes = result.warnings.length > 0 ? result.warnings.join('；') : undefined
      toast.success(`已导入「${result.name}」`, { description: notes })
    } catch (err) {
      toast.error('导入地图包失败', { description: messageOf(err) })
    } finally {
      setImporting(false)
    }
  }

  const onArchivePicked = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await handleImportArchive(file)
  }

  /**
   * 打开生成器。带上 `preset` 就是「在这张图上重新生成」：
   * 种子与参数原样带过去，调几下参数再生成，出来的还是同一片大陆。
   */
  const openGenerator = (preset?: { seed?: number; params?: string }): void => {
    if (!canGenerate) return
    setGeneratorPreset(preset ?? null)
    setGeneratorOpen(true)
    setLibraryOpen(false)
    setSwitcherOpen(false)
    setCanvasMenu(null)
    setToolMenu(null)
    setDraft(null)
    // 剖面抽屉在画布下方占 160px，进生成器时它只会把预览挤扁
    setProfile(null)
    setProfileError(null)
  }

  // 生成器开着的时候把插件关掉：不写 state，渲染期直接当作没开（见 `showGenerator`）
  const showGenerator = generatorOpen && canGenerate

  const menuTarget = canvasMenu?.target ?? null
  const canvasMenuItems = [
    // 已有标注压在最上面，但**不替换**画线入口：国界是多边形，右键落在面里是常态
    ...(menuTarget
      ? [
          {
            label: '颜色...',
            icon: <Palette size={13} strokeWidth={2} />,
            onSelect: () => {
              if (canvasMenu) setPaintMenu({ target: menuTarget, at: canvasMenu.at })
            },
          },
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
      onSelect: () => {
        const origin = canvasMenu?.anchor
        startDraft('border', origin)
      },
    },
    {
      label: '画道路',
      icon: <Route size={13} strokeWidth={2} />,
      onSelect: () => {
        const origin = canvasMenu?.anchor
        startDraft('road', origin)
      },
    },
    {
      label: '取地形剖面',
      icon: <Activity size={13} strokeWidth={2} />,
      onSelect: () => {
        const origin = canvasMenu?.anchor
        startProfile(origin)
      },
    },
  ]

  /** 右下「标注」：画线入口从「右键才知道」变成看得见 */
  const toolItems: MediaMenuItem[] = [
    { label: '画国界', icon: <PenLine size={13} strokeWidth={2} />, onSelect: () => startDraft('border') },
    { label: '画道路', icon: <Route size={13} strokeWidth={2} />, onSelect: () => startDraft('road') },
    { label: '取地形剖面', icon: <Activity size={13} strokeWidth={2} />, onSelect: () => startProfile() },
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
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
            新建地图
          </button>
          <button
            type="button"
            onClick={() => archiveInputRef.current?.click()}
            disabled={importing}
            className={BTN_QUIET}
          >
            <PackageOpen size={13} strokeWidth={2} />
            导入地图包
          </button>
        </div>
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
      <input
        ref={archiveInputRef}
        type="file"
        accept=".ocmap,application/json"
        className="hidden"
        onChange={(event) => void onArchivePicked(event)}
      />
      <div className="relative h-full w-full overflow-hidden">
        {active ? (
          <MapCanvas
            map={active}
            viewport={viewport}
            points={shown}
            allLayersOff={allLayersOff}
            onMoveAnchor={handleMoveAnchor}
            onCommitAnchor={handleCommitAnchor}
            onRemoveAnchor={handleRemoveAnchor}
            onOpenAnchor={handleOpenAnchor}
            onEnableAllLayers={handleEnableAllLayers}
            onPickBackground={pickBackground}
            onGenerate={canGenerate ? () => openGenerator() : undefined}
            readOnly={mapMode === 'view'}
            annotations={annotations}
            draft={draft}
            onDraftPoint={handleDraftPoint}
            onCanvasContextMenu={handleCanvasContextMenu}
            bleed
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-ink-muted">还没有地图</p>
          </div>
        )}

        {/* 生成器是一整块工作区，盖在画布上（画布保持挂载：视口尺寸不能因为切走一次就丢）。
            md 以上用 flex 把剩余高度整块交给面板（面板自己 `h-full`，内部各栏各自滚）；
            手机上保持自然流，长表单交给这层滚动 —— 别把这层 `overflow-y-auto` 关掉。 */}
        {showGenerator ? (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-paper px-4 pb-6 pt-3 md:flex md:flex-col md:overflow-hidden md:px-6">
            {/* 标题只给「从地图跳进来」的这一条路：画布退到后面，别处没有东西告诉用户这是哪一页。
                侧栏「工具 › 地图生成器」那条入口不加（侧栏已经点明了），见 `MapToolView`。 */}
            <h1 className={`mb-3 flex h-8 shrink-0 items-center md:mb-5 ${PAGE_TITLE}`}>地图生成器</h1>
            <div className="md:min-h-0 md:flex-1">
              <MapGeneratorPanel
                onUseAsBackground={handleGenerated}
                // 从地图里打开的生成器：写回这张图的底图（工具页那边是新建，见 MapToolView）
                target={active ? { kind: 'existing', name: active.name } : undefined}
                initialSeed={generatorPreset?.seed}
                initialParams={generatorPreset?.params}
              />
            </div>
          </div>
        ) : null}

        {/* 地图列表打开时的点外关闭层：压住画布，但不挡顶部与底部浮层 */}
        {switcherOpen ? (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setSwitcherOpen(false)}
            aria-hidden
          />
        ) : null}

        {/* 顶栏：左 = 我在看哪张图，右 = 模式与输出 */}
        <div className="pointer-events-none absolute inset-x-3 top-[calc(0.75rem+var(--oc-titlebar-h))] z-20 flex items-start justify-between gap-2">
          {!showGenerator && active ? (
            <div className="pointer-events-auto relative min-w-0">
              {/* 悬停只把纸变实：叠 `--oc-hover` 会把 `bg-paper/85` 整个顶掉，
                  卡片就只剩 6% 墨，地图直接从字底下透上来（看着像一块半透明绿）。 */}
              <button
                type="button"
                onClick={() => setSwitcherOpen((previous) => !previous)}
                aria-expanded={switcherOpen}
                aria-haspopup="dialog"
                aria-label="切换地图"
                className={`flex h-8 min-w-0 max-w-[min(56vw,340px)] items-center gap-1.5 px-2.5 text-left transition-colors hover:bg-paper ${FLOAT_SKIN}`}
              >
                <span className="min-w-0 truncate text-[13px] text-ink">{active.name}</span>
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  className={`shrink-0 text-ink-faint transition-transform duration-150 ${
                    switcherOpen ? 'rotate-180' : ''
                  }`}
                />
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint max-sm:hidden">
                  {shown.length} 个锚点
                </span>
              </button>

              {switcherOpen ? (
                <div className="absolute left-0 top-full z-30 mt-2 w-[320px] max-w-[calc(100vw-24px)]">
                  <MapSwitcher
                    maps={maps}
                    activeId={active.id}
                    anchorCount={(map) => anchorStats.counts.get(map.name) ?? 0}
                    onSelect={selectMap}
                    onCreate={() => void handleCreate()}
                    onRename={async (id, name) => {
                      // 失败（比如与另一张图重名）要**说出来**，否则输入框一收就像没发生
                      try {
                        await renameMap(id, name)
                      } catch (err) {
                        toast.error('改名失败', { description: messageOf(err) })
                      } finally {
                        await reload()
                      }
                    }}
                    onDelete={async (id, name) => {
                      try {
                        await deleteMap(id, name)
                        toast.success('已移到回收站')
                      } catch (err) {
                        toast.error('删除失败', { description: messageOf(err) })
                      } finally {
                        // 成功失败都重新读一遍：列表留着一张「其实已经删了」的旧行，
                        // 用户下次新建/改名撞上它，就会说「怎么又说已存在」
                        await reload()
                      }
                    }}
                    onOpenDetail={() => {
                      setSwitcherOpen(false)
                      setLibraryOpen(true)
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <span />
          )}

          {hasBase || showGenerator ? (
          <div className={`pointer-events-auto shrink-0 ${FLOAT_BAR}`}>
            {showGenerator ? (
              <button type="button" onClick={() => setGeneratorOpen(false)} className={FLOAT_BAR_TEXT}>
                <ArrowLeft size={13} strokeWidth={2} />
                画布
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setImmersive((previous) => !previous)}
              className={FLOAT_BAR_ICON}
              title={immersive ? '退出全屏' : '全屏'}
              aria-label={immersive ? '退出全屏' : '全屏'}
            >
              {immersive ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
            </button>

            {!showGenerator ? (
              <button
                type="button"
                onClick={toggleMapMode}
                aria-pressed={mapMode === 'edit'}
                className={`${FLOAT_BAR_TEXT} max-md:hidden ${
                  mapMode === 'edit' ? 'bg-[var(--oc-hover)] text-ink' : ''
                }`}
              >
                {mapMode === 'edit' ? (
                  <Check size={13} strokeWidth={2} />
                ) : (
                  <Pencil size={13} strokeWidth={2} />
                )}
                {mapMode === 'edit' ? '完成' : '编辑'}
              </button>
            ) : null}

            {!showGenerator ? (
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMoreMenu({
                    at: { x: rect.left, y: rect.bottom + 6 },
                    items: buildMoreItems({
                      hasImage: Boolean(active?.image),
                      exporting,
                      onExport: () => {
                        if (!exporting) void handleExport()
                      },
                      onExportArchive: () => {
                        if (active && !exporting) void handleExportArchive(active)
                      },
                      onImportArchive: () => archiveInputRef.current?.click(),
                      onPickBackground: pickBackground,
                      onRemoveBackground: () => void handleRemoveBackground(),
                      ...(canGenerate ? { onGenerate: () => openGenerator() } : {}),
                      onOpenLibrary: () => setLibraryOpen(true),
                    }),
                  })
                }}
                className={FLOAT_BAR_ICON}
                aria-label="更多"
                title="更多"
              >
                <MoreHorizontal size={15} strokeWidth={2} />
              </button>
            ) : null}
          </div>
          ) : null}
        </div>

        {/* 左下 / 底部居中：一条控制条（图层 + 底图档位） */}
        {!showGenerator && active && hasBase ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20">
            <MapControlBar
              views={canSwitchView ? VIEWS : []}
              activeView={activeView}
              busy={switching}
              progress={switchProgress}
              onSelectView={(view) => void handleSwitchView(view)}
              layers={layers}
              onToggleLayer={handleToggleLayer}
              legendView={canSwitchView ? activeView : null}
            />
          </div>
        ) : null}

        {/* 右下：编辑态才有「标记 / 标注」，缩放常驻 */}
        {!showGenerator && active?.image ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
            {mapMode === 'edit' ? (
              <div className={`pointer-events-auto max-md:hidden ${FLOAT_STACK}`}>
                <button
                  type="button"
                  onClick={() => setAnchorPickerOpen(true)}
                  className={TOOL_BTN}
                  title="添加锚点"
                  aria-label="添加锚点"
                >
                  <MapPin size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setToolMenu({ x: rect.left, y: rect.top })
                  }}
                  className={TOOL_BTN}
                  title="标注"
                  aria-label="标注"
                >
                  <PenLine size={15} strokeWidth={2} />
                </button>
              </div>
            ) : null}

            <div className={`pointer-events-auto ${FLOAT_BAR}`}>
              <button
                type="button"
                onClick={viewport.zoomOut}
                className={FLOAT_BAR_ICON}
                aria-label="缩小"
                title="缩小"
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <span className="w-9 text-center text-[11px] tabular-nums text-ink-faint">
                {Math.round(viewport.scale * 100)}%
              </span>
              <button
                type="button"
                onClick={viewport.zoomIn}
                className={FLOAT_BAR_ICON}
                aria-label="放大"
                title="放大"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={viewport.reset}
                className={FLOAT_BAR_ICON}
                aria-label="复位"
                title="复位"
              >
                <RotateCcw size={14} strokeWidth={2} />
              </button>
            </div>
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

      {libraryOpen && active ? (
        <MapDetailDialog
          map={active}
          anchorCount={anchorStats.counts.get(active.name) ?? 0}
          unassignedAnchors={anchorStats.unassigned}
          canDelete={maps.length > 1}
          onClose={() => setLibraryOpen(false)}
          onRename={async (id, name) => {
            await renameMap(id, name)
            await reload()
          }}
          onDelete={async (id) => {
            await deleteMap(id)
            await reload()
          }}
          onEdit={() => {
            applyMapMode('edit')
            setLibraryOpen(false)
          }}
          onRegenerate={
            canGenerate ? () => openGenerator({ seed: active.seed, params: active.params }) : undefined
          }
          onExport={() => handleExportMap(active)}
          onExportJpg={() => handleExportMap(active, 'jpg')}
          onExportArchive={() => handleExportArchive(active)}
        />
      ) : null}

      {moreMenu ? (
        <MediaContextMenu at={moreMenu.at} onClose={() => setMoreMenu(null)} items={moreMenu.items} />
      ) : null}

      {toolMenu ? (
        <MediaContextMenu at={toolMenu} onClose={() => setToolMenu(null)} items={toolItems} />
      ) : null}

      {canvasMenu ? (
        <MediaContextMenu at={canvasMenu.at} onClose={() => setCanvasMenu(null)} items={canvasMenuItems} />
      ) : null}

      {paintMenu ? (
        <AnnotationColorMenu
          target={paintMenu.target}
          at={paintMenu.at}
          onClose={() => setPaintMenu(null)}
          onColor={(color) => void setAnnotationColor(paintMenu.target, color)}
          onFill={(fill) => void setAnnotationFill(paintMenu.target, fill)}
        />
      ) : null}
    </div>
  )
}
