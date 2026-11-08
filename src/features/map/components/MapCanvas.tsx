'use client'

/**
 * 地图画布：底图 + 锚点 + 缩放/平移 + 锚点右键菜单。
 *
 * 交互口径：
 * - 单击锚点 = 打开实体；桌面拖动锚点 = 改位置（松手才写回）
 * - 右键 / 长按锚点 = 菜单（查看态只给「打开」，删除只在编辑态出现）
 * - 空白拖动平移、滚轮以光标为中心缩放、双指捏合
 * - 移动端锚点不拖动（`docs/地图.md` §4），只导航
 *
 * **画布上不放控件**：缩放、加锚点、标注都在 `MapView` 的四角浮层里。
 * 这里只剩「图 + 点 + 右键」，空态也一样 —— 没有底图时给一张居中的小卡（生成 / 导入）,
 * 它是**一次性入口**，不是常驻工具。
 *
 * 锚点坐标始终是归一化 0–1；缩放只作用于 stage，写回时用 stage 的
 * `getBoundingClientRect()` 反算，所以放大后拖动仍然准。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ExternalLink, Layers, MapPin, MapPinOff, Upload, Wand2 } from 'lucide-react'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { BTN_PRIMARY, BTN_QUIET, ROUND_ITEM, PANEL } from '@/lib/ui-tokens'
import { triggerHaptic } from '@/lib/haptics'
import { resolveImageUrl } from '@/lib/image-service'
import { useDevice } from '@/lib/use-device'
import { MAP_LAYER_LABELS, type MapAnchor } from '../types'
import type { AnchorPoint, MapEntity } from '../services'
import type { AnnotationKind, AnnotationPoint, MapAnnotation } from '../annotations'
import { AnnotationLayer } from './AnnotationLayer'
import type { MapViewport } from '../hooks/useMapViewport'

/** 正在画的那条线（点还在增加） */
export interface AnnotationDraft {
  kind: AnnotationKind
  points: AnnotationPoint[]
}

const LONG_PRESS_MS = 320
const LONG_PRESS_MOVE = 8
const DRAG_MOVE = 3

interface AnchorPress {
  key: string
  point: AnchorPoint
  pointerId: number
  startX: number
  startY: number
  lastAnchor: MapAnchor
  moved: boolean
  longPressed: boolean
  timer: number | null
}

interface MenuState {
  x: number
  y: number
  point: AnchorPoint
}

export interface MapCanvasProps {
  map: MapEntity
  /** 缩放 / 平移状态：由宿主持有，浮层里的缩放条才能和画布共用同一个视口 */
  viewport: MapViewport
  /** 当前地图 + 当前图层下要显示的锚点 */
  points: readonly AnchorPoint[]
  /** 三层全部关掉 */
  allLayersOff: boolean
  onMoveAnchor: (point: AnchorPoint, anchor: MapAnchor) => void
  onCommitAnchor: (point: AnchorPoint, anchor: MapAnchor) => void
  onRemoveAnchor: (point: AnchorPoint) => void
  onOpenAnchor: (point: AnchorPoint) => void
  onEnableAllLayers: () => void
  onPickBackground: () => void
  /** 没有底图时，空态里的第二个出口 */
  /** 生成器插件关掉时不传：空态卡里只剩「导入底图」 */
  onGenerate?: () => void
  /** 查看模式：只读（锚点不可拖、右键不给删除），点锚点=跳实体 */
  readOnly?: boolean
  /** 铺满整块内容区（整屏画布）：去掉边框与圆角 */
  bleed?: boolean
  /** 政治标注（国界 / 道路） */
  annotations?: readonly MapAnnotation[]
  /** 正在画的那条线 */
  draft?: AnnotationDraft | null
  /** 画线时点一下（归一化坐标） */
  onDraftPoint?: (anchor: MapAnchor) => void
  /** 空白处右键：由宿主决定开什么菜单（画国界 / 画道路 / 删除标注） */
  onCanvasContextMenu?: (anchor: MapAnchor, at: { x: number; y: number }) => void
}

function anchorKey(point: AnchorPoint): string {
  return `${point.kind}:${point.id}`
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function MapCanvas({
  map,
  viewport,
  points,
  allLayersOff,
  onMoveAnchor,
  onCommitAnchor,
  onRemoveAnchor,
  onOpenAnchor,
  onEnableAllLayers,
  onPickBackground,
  onGenerate,
  readOnly = false,
  bleed = false,
  annotations = [],
  draft = null,
  onDraftPoint,
  onCanvasContextMenu,
}: MapCanvasProps) {
  const { isMobile } = useDevice()
  /** 移动端与「查看模式」都只读：能缩放 / 平移，不改数据 */
  const locked = isMobile || readOnly
  const {
    viewportRef,
    stageWidth,
    stageHeight,
    scale,
    transform: stageTransform,
    panning,
    viewportProps,
  } = viewport
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pressRef = useRef<AnchorPress | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 底图加载失败（文件被移走 / 浏览器里存的 blob: 已过期）时退回空态，别留一个破图图标 */
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const hasImage = Boolean(map.image) && failedImage !== map.image

  useEffect(() => {
    return () => {
      const press = pressRef.current
      if (press?.timer != null) window.clearTimeout(press.timer)
    }
  }, [])

  const pointFromClient = useCallback((clientX: number, clientY: number): MapAnchor | null => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }, [])

  const cancelPress = useCallback(() => {
    const press = pressRef.current
    if (press?.timer != null) window.clearTimeout(press.timer)
    pressRef.current = null
    setDragKey(null)
  }, [])

  const beginPress = (event: ReactPointerEvent<HTMLButtonElement>, point: AnchorPoint) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()

    const key = anchorKey(point)
    // 上一次长按/拖动如果没等到 click，残留的抑制标记会在下一次按下时清掉
    if (suppressClickRef.current === key) suppressClickRef.current = null

    const press: AnchorPress = {
      key,
      point,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastAnchor: point.anchor,
      moved: false,
      longPressed: false,
      timer: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)

    if (locked) {
      press.timer = window.setTimeout(() => {
        const current = pressRef.current
        if (!current || current.key !== key) return
        current.timer = null
        current.longPressed = true
        suppressClickRef.current = key
        void triggerHaptic()
        setMenu({ x: current.startX, y: current.startY, point })
      }, LONG_PRESS_MS)
    } else {
      setDragKey(key)
    }

    pressRef.current = press
  }

  const movePress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const dx = event.clientX - press.startX
    const dy = event.clientY - press.startY
    const distance = Math.hypot(dx, dy)

    if (locked) {
      if (press.timer !== null && distance > LONG_PRESS_MOVE) {
        window.clearTimeout(press.timer)
        press.timer = null
      }
      return
    }

    if (!press.moved && distance > DRAG_MOVE) press.moved = true
    if (!press.moved) return

    const anchor = pointFromClient(event.clientX, event.clientY)
    if (!anchor) return
    press.lastAnchor = anchor
    onMoveAnchor(press.point, anchor)
  }

  const endPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    if (press.timer !== null) {
      window.clearTimeout(press.timer)
      press.timer = null
    }

    if (!locked && press.moved) {
      const anchor =
        event.type === 'pointercancel'
          ? press.lastAnchor
          : (pointFromClient(event.clientX, event.clientY) ?? press.lastAnchor)
      press.lastAnchor = anchor
      // 拖动结束后浏览器还会补一个 click；必须吞掉，否则一拖就跳转
      suppressClickRef.current = press.key
      onCommitAnchor(press.point, anchor)
    }

    if (press.longPressed) suppressClickRef.current = press.key

    pressRef.current = null
    setDragKey(null)
  }

  const handleClick = (point: AnchorPoint) => {
    const key = anchorKey(point)
    if (suppressClickRef.current === key) {
      suppressClickRef.current = null
      return
    }
    onOpenAnchor(point)
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, point: AnchorPoint) => {
    event.preventDefault()
    event.stopPropagation()
    const press = pressRef.current
    const pointerType = (event.nativeEvent as PointerEvent).pointerType
    if (pointerType === 'touch' || pointerType === 'pen' || press?.longPressed === true) {
      suppressClickRef.current = anchorKey(point)
    }
    const x = event.clientX || press?.startX || 0
    const y = event.clientY || press?.startY || 0
    cancelPress()
    setMenu({ x, y, point })
  }

  /** 空白处右键：坐标交给宿主，它来决定菜单（画国界 / 画道路 / 删除标注） */
  const handleCanvasContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (locked || !onCanvasContextMenu) return
    event.preventDefault()
    const anchor = pointFromClient(event.clientX, event.clientY)
    if (!anchor) return
    onCanvasContextMenu(anchor, { x: event.clientX, y: event.clientY })
  }

  /** 空态：有锚点或标注时不抢画面 */
  const empty = (() => {
    if (points.length > 0) return null
    // 有标注（或正在画）时，中间那块空态会压在图形上；没有底图这件事交给这张卡
    if (draft !== null || annotations.length > 0) return null
    if (!hasImage) return 'no-image' as const
    if (allLayersOff) return 'layers-off' as const
    // 「还没有锚点」不进中间那块：加号在右下角，压在画布正中的提示会一直挡住地图
    return null
  })()

  return (
    <div
      ref={viewportRef}
      {...viewportProps}
      onContextMenu={handleCanvasContextMenu}
      className={`relative h-full w-full touch-none overflow-hidden bg-paper ${
        bleed ? '' : `border border-line ${ROUND_ITEM}`
      } ${panning ? 'cursor-grabbing' : hasImage ? 'cursor-grab' : ''}`}
    >
      <div
        ref={stageRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: stageWidth,
          height: stageHeight,
          transform: stageTransform,
        }}
      >
        {map.image && hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(map.image, 'map')}
            alt=""
            draggable={false}
            onError={() => setFailedImage(map.image ?? null)}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          />
        ) : null}

        {/* 政治标注（国界 / 道路）画在底图之上、锚点之下 */}
        <AnnotationLayer
          items={annotations}
          draft={draft}
          width={stageWidth}
          height={stageHeight}
          scale={scale}
        />

        {/* 画线时把点击收在这一层：不冒泡到画布，免得一边加点一边平移 */}
        {draft ? (
          <div
            className="absolute inset-0 z-10 cursor-crosshair"
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              const anchor = pointFromClient(event.clientX, event.clientY)
              if (anchor) onDraftPoint?.(anchor)
            }}
          />
        ) : null}

        {points.map((point) => {
          const key = anchorKey(point)
          const dragging = dragKey === key
          return (
            <div
              key={key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${point.anchor.x * 100}%`,
                top: `${point.anchor.y * 100}%`,
              }}
            >
              {/* 标签反向缩放：stage 放大后仍保持原字号 */}
              <button
                type="button"
                data-map-anchor
                title={`${MAP_LAYER_LABELS[point.kind]}：${point.title}`}
                onPointerDown={(event) => beginPress(event, point)}
                onPointerMove={movePress}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onClick={() => handleClick(point)}
                onContextMenu={(event) => handleContextMenu(event, point)}
                className={`select-none whitespace-nowrap rounded-item border bg-paper/90 px-2 py-0.5 text-[11px] text-ink backdrop-blur transition-colors max-md:max-w-[36vw] max-md:truncate ${
                  dragging ? 'border-ink' : 'border-line hover:border-line-hover'
                } ${locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                style={{ transform: `scale(${1 / scale})` }}
              >
                {point.title}
              </button>
            </div>
          )
        })}
      </div>

      {empty === 'no-image' ? (
        // 一次性入口：生成一张，或者导入自己画好的底图。两种地图从这里开始分岔。
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div
            className={`pointer-events-auto flex w-[264px] flex-col items-center gap-3 p-5 text-center ${PANEL}`}
          >
            <MapPin size={20} strokeWidth={2} className="text-ink-faint" />
            <p className="text-sm text-ink-muted">还没有底图</p>
            <div className="flex w-full flex-col gap-1.5">
              {onGenerate !== undefined ? (
                <button type="button" onClick={onGenerate} className={`${BTN_PRIMARY} justify-center`}>
                  <Wand2 size={14} strokeWidth={2} />
                  生成地图
                </button>
              ) : null}
              <button
                type="button"
                onClick={onPickBackground}
                className={`${onGenerate === undefined ? BTN_PRIMARY : BTN_QUIET} justify-center`}
              >
                <Upload size={14} strokeWidth={2} />
                导入底图
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {empty === 'layers-off' ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <ListEmptyState
            icon={Layers}
            message="图层都关掉了"
            action={{ label: '全部打开', onClick: onEnableAllLayers }}
            className="pointer-events-none w-full [&_button]:pointer-events-auto"
          />
        </div>
      ) : null}

      {menu ? (
        <MediaContextMenu
          at={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={
            locked
              ? [
                  {
                    label: '打开',
                    icon: <ExternalLink size={13} strokeWidth={2} />,
                    onSelect: () => onOpenAnchor(menu.point),
                  },
                ]
              : [
                  {
                    label: '打开',
                    icon: <ExternalLink size={13} strokeWidth={2} />,
                    onSelect: () => onOpenAnchor(menu.point),
                  },
                  {
                    label: '移除锚点',
                    danger: true,
                    icon: <MapPinOff size={13} strokeWidth={2} />,
                    onSelect: () => onRemoveAnchor(menu.point),
                  },
                ]
          }
        />
      ) : null}
    </div>
  )
}
