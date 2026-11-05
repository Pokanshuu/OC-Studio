'use client'

/**
 * 地图画布的缩放 / 平移（M2）。
 *
 * 与关系图同一套手势口径：滚轮以光标为中心缩放、空白拖动平移、双指捏合。
 * 这里不引任何依赖，只碰 DOM 指针事件；锚点坐标仍然是**归一化 0–1**，
 * 缩放只是把承载锚点的 stage 做 `translate + scale`，写回实体时不受影响。
 *
 * 结构：
 * - `viewportRef`：裁剪容器（`overflow-hidden` + `touch-none`），负责量尺寸与接手势
 * - stage：按底图比例 fit 进容器的矩形，`transform: translate(x,y) scale(scale)`
 * - `scale` 是相对 fit 尺寸的倍率（0.5–3）；复位 = 1 + 居中
 *
 * 平移会被夹在容器内：放大时不留空白，缩小时整张图不跑出视野。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

export const MIN_MAP_SCALE = 0.5
export const MAX_MAP_SCALE = 3

interface Size {
  width: number
  height: number
}

interface ViewState {
  scale: number
  x: number
  y: number
}

interface Point {
  x: number
  y: number
}

interface PinchState {
  distance: number
  scale: number
  stageX: number
  stageY: number
}

export interface MapViewport {
  viewportRef: RefObject<HTMLDivElement | null>
  /** fit 后的 stage 尺寸（未乘 scale） */
  stageWidth: number
  stageHeight: number
  scale: number
  transform: string
  panning: boolean
  reset: () => void
  zoomIn: () => void
  zoomOut: () => void
  viewportProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 底图按比例 fit 进容器：先占满宽，太高再按高回缩 */
function fitStage(size: Size, aspectRatio: number): Size {
  if (size.width <= 0 || size.height <= 0) return { width: 0, height: 0 }
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9
  let width = size.width
  let height = width / ratio
  if (height > size.height) {
    height = size.height
    width = height * ratio
  }
  return { width, height }
}

/** 一条轴上的夹取：内容比容器小 → 停在容器内；比容器大 → 不留空白 */
function clampAxis(value: number, viewport: number, content: number): number {
  if (content <= viewport) return clamp(value, 0, viewport - content)
  return clamp(value, viewport - content, 0)
}

function clampView(view: ViewState, viewport: Size, stage: Size): ViewState {
  const contentWidth = stage.width * view.scale
  const contentHeight = stage.height * view.scale
  return {
    scale: view.scale,
    x: clampAxis(view.x, viewport.width, contentWidth),
    y: clampAxis(view.y, viewport.height, contentHeight),
  }
}

function isAnchorTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-map-anchor]') !== null
}

/** 空态按钮 / 缩放控件 / 图层菜单等压在画布上的控件不触发平移 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a, input, textarea, select, [role="button"], [role="menu"]') !== null
  )
}

function pointerPair(points: Map<number, Point>): [Point, Point] | null {
  const values = Array.from(points.values())
  if (values.length < 2) return null
  return [values[0], values[1]]
}

export function useMapViewport(aspectRatio: number, resetKey?: string | number): MapViewport {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)

  const stage = fitStage(size, aspectRatio)
  const stageRef = useRef(stage)
  const sizeRef = useRef(size)
  const viewRef = useRef(view)

  useEffect(() => {
    stageRef.current = { width: stage.width, height: stage.height }
  }, [stage.width, stage.height])

  useEffect(() => {
    sizeRef.current = { width: size.width, height: size.height }
  }, [size.width, size.height])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  const pointersRef = useRef(new Map<number, Point>())
  const panRef = useRef<Point | null>(null)
  const pinchRef = useRef<PinchState | null>(null)

  const applyView = useCallback((next: ViewState) => {
    const clamped = clampView(next, sizeRef.current, stageRef.current)
    viewRef.current = clamped
    setView(clamped)
  }, [])

  // 量容器。窗口 / 侧栏 / 页头变化都会重新 fit；尺寸变化时复位到居中。
  // 依赖 `resetKey`：视口状态被提到宿主（浮层里的缩放条要和画布共用同一个视口）之后，
  // 画布是「地图读到之后」才挂上的 —— 只跑一次的话 ref 还是空的，永远量不到尺寸。
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const update = () => {
      // clientWidth / clientHeight 不含 border：stage 从内容区左上角开始
      const width = element.clientWidth
      const height = element.clientHeight
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      )
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [resetKey])

  // 首次量到尺寸、换图（比例变化）、容器尺寸变化 → 复位到「整张图居中、倍率 1」
  useEffect(() => {
    const width = size.width
    const height = size.height
    if (width <= 0 || height <= 0) return
    const fitted = fitStage({ width, height }, aspectRatio)
    const centered: ViewState = {
      scale: 1,
      x: (width - fitted.width) / 2,
      y: (height - fitted.height) / 2,
    }
    viewRef.current = centered
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 容器尺寸 / 底图比例 / 换图后复位视图
    setView(centered)
  }, [size.width, size.height, aspectRatio, resetKey])

  const reset = useCallback(() => {
    const box = sizeRef.current
    const fitted = stageRef.current
    applyView({ scale: 1, x: (box.width - fitted.width) / 2, y: (box.height - fitted.height) / 2 })
  }, [applyView])

  /** 以容器坐标 `(px, py)` 为中心缩放：该点下方的 stage 位置保持不动 */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const current = viewRef.current
      const nextScale = clamp(current.scale * factor, MIN_MAP_SCALE, MAX_MAP_SCALE)
      if (nextScale === current.scale) return
      const ratio = nextScale / current.scale
      applyView({
        scale: nextScale,
        x: px - (px - current.x) * ratio,
        y: py - (py - current.y) * ratio,
      })
    },
    [applyView],
  )

  // 原生 wheel 监听：React 的 wheel 在部分 WebView 上是 passive，preventDefault 会失效。
  // 依赖 `resetKey` 和量尺寸那个 effect 同一个理由：视口状态提到宿主之后，这个 hook 在
  // 画布挂载**之前**就跑过一次，那时 `viewportRef.current` 还是 null，只跑一次就再也不接滚轮了。
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomAt, resetKey])

  const zoomBy = useCallback(
    (factor: number) => {
      const box = sizeRef.current
      zoomAt(box.width / 2, box.height / 2, factor)
    },
    [zoomAt],
  )

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (isAnchorTarget(event.target) || isInteractiveTarget(event.target)) return
    const element = viewportRef.current
    if (!element) return

    element.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 1) {
      panRef.current = { x: event.clientX, y: event.clientY }
      pinchRef.current = null
      setPanning(true)
      return
    }

    const pair = pointerPair(pointersRef.current)
    if (!pair) return
    const rect = element.getBoundingClientRect()
    const [a, b] = pair
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const current = viewRef.current
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: current.scale,
      stageX: (midpoint.x - rect.left - current.x) / current.scale,
      stageY: (midpoint.y - rect.top - current.y) / current.scale,
    }
    panRef.current = null
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      const element = viewportRef.current
      if (!element) return

      const pair = pointerPair(pointersRef.current)
      const pinch = pinchRef.current
      if (pair && pinch) {
        const rect = element.getBoundingClientRect()
        const [a, b] = pair
        const midpoint = {
          x: (a.x + b.x) / 2 - rect.left,
          y: (a.y + b.y) / 2 - rect.top,
        }
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
        const nextScale = clamp(pinch.scale * (distance / pinch.distance), MIN_MAP_SCALE, MAX_MAP_SCALE)
        applyView({
          scale: nextScale,
          x: midpoint.x - pinch.stageX * nextScale,
          y: midpoint.y - pinch.stageY * nextScale,
        })
        return
      }

      const pan = panRef.current
      if (!pan || pointersRef.current.size !== 1) return
      const dx = event.clientX - pan.x
      const dy = event.clientY - pan.y
      panRef.current = { x: event.clientX, y: event.clientY }
      applyView({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy })
    },
    [applyView],
  )

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0]
      panRef.current = { x: remaining.x, y: remaining.y }
      pinchRef.current = null
      return
    }
    if (pointersRef.current.size === 0) {
      panRef.current = null
      pinchRef.current = null
      setPanning(false)
    }
  }, [])

  return {
    viewportRef,
    stageWidth: stage.width,
    stageHeight: stage.height,
    scale: view.scale,
    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
    panning,
    reset,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    viewportProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: releasePointer,
      onPointerCancel: releasePointer,
    },
  }
}
