'use client'

/**
 * 地图画布：底图 + 锚点 + 缩放/平移 + 锚点右键菜单。
 *
 * 交互口径：
 * - 单击锚点 = 打开实体；桌面拖动锚点 = 改位置（松手才写回）
 * - 右键 / 长按锚点 = 菜单（打开 / 移除锚点）
 * - 空白拖动平移、滚轮以光标为中心缩放、双指捏合、右下角复位
 * - 移动端锚点不拖动（`docs/地图.md` §4），只导航
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
import { ExternalLink, MapPinOff, Minus, Plus, RotateCcw } from 'lucide-react'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { triggerHaptic } from '@/lib/haptics'
import { resolveImageUrl } from '@/lib/image-service'
import { ICON_BTN_MD, ROUND_CONTROL, ROUND_ITEM } from '@/lib/ui-tokens'
import { useDevice } from '@/lib/use-device'
import { MAP_LAYER_LABELS, type MapAnchor } from '../types'
import type { AnchorPoint, MapEntity } from '../services'
import { useMapViewport } from '../hooks/useMapViewport'

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
  /** 当前地图 + 当前图层下要显示的锚点 */
  points: readonly AnchorPoint[]
  /** 当前地图上的锚点总数（不受图层开关影响） */
  totalOnMap: number
  /** 三层全部关掉 */
  allLayersOff: boolean
  onMoveAnchor: (point: AnchorPoint, anchor: MapAnchor) => void
  onCommitAnchor: (point: AnchorPoint, anchor: MapAnchor) => void
  onRemoveAnchor: (point: AnchorPoint) => void
  onOpenAnchor: (point: AnchorPoint) => void
  onAddAnchor: () => void
  onEnableAllLayers: () => void
  onPickBackground: () => void
}

function anchorKey(point: AnchorPoint): string {
  return `${point.kind}:${point.id}`
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function MapCanvas({
  map,
  points,
  totalOnMap,
  allLayersOff,
  onMoveAnchor,
  onCommitAnchor,
  onRemoveAnchor,
  onOpenAnchor,
  onAddAnchor,
  onEnableAllLayers,
  onPickBackground,
}: MapCanvasProps) {
  const { isMobile } = useDevice()
  const {
    viewportRef,
    stageWidth,
    stageHeight,
    scale,
    transform: stageTransform,
    panning,
    reset,
    zoomIn,
    zoomOut,
    viewportProps,
  } = useMapViewport(map.width && map.height ? map.width / map.height : 16 / 9, map.id)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pressRef = useRef<AnchorPress | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

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

    if (isMobile) {
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

    if (isMobile) {
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

    if (!isMobile && press.moved) {
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

  const empty = (() => {
    if (points.length > 0) return null
    if (!map.image) {
      return {
        message: '还没有底图',
        action: { label: '设置底图', onClick: onPickBackground },
      }
    }
    if (allLayersOff) {
      return {
        message: '图层都关掉了',
        action: { label: '全部打开', onClick: onEnableAllLayers },
      }
    }
    if (totalOnMap === 0) {
      return {
        message: '还没有锚点',
        action: { label: '添加锚点', onClick: onAddAnchor },
      }
    }
    return {
      message: '这些图层还没有锚点',
      action: { label: '全部打开', onClick: onEnableAllLayers },
    }
  })()

  return (
    <div
      ref={viewportRef}
      {...viewportProps}
      className={`relative h-full w-full touch-none overflow-hidden border border-line bg-paper ${ROUND_ITEM} ${
        panning ? 'cursor-grabbing' : map.image ? 'cursor-grab' : ''
      }`}
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
        {map.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(map.image, 'map')}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
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
                } ${isMobile ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                style={{ transform: `scale(${1 / scale})` }}
              >
                {point.title}
              </button>
            </div>
          )
        })}
      </div>

      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <ListEmptyState
            message={empty.message}
            action={empty.action}
            className="pointer-events-none w-full [&_button]:pointer-events-auto"
          />
        </div>
      ) : null}

      {map.image ? (
        <div className={`absolute bottom-2 right-2 z-20 flex items-center gap-0.5 border border-line bg-paper/85 p-1 backdrop-blur ${ROUND_CONTROL}`}>
          <button
            type="button"
            className={ICON_BTN_MD}
            onClick={zoomOut}
            aria-label="缩小"
            title="缩小"
          >
            <Minus size={14} strokeWidth={2} />
          </button>
          <span className="w-9 text-center text-[11px] tabular-nums text-ink-faint">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className={ICON_BTN_MD}
            onClick={zoomIn}
            aria-label="放大"
            title="放大"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={ICON_BTN_MD}
            onClick={reset}
            aria-label="复位"
            title="复位"
          >
            <RotateCcw size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {menu ? (
        <MediaContextMenu
          at={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={[
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
          ]}
        />
      ) : null}
    </div>
  )
}
