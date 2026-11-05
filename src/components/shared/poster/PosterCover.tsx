'use client'

/**
 * 海报封面：**遮罩固定，图片在里面平移 / 缩放**。
 *
 * 六套版式的每一个封面槽都用这个组件，所以「这张图该裁到哪儿」在哪儿都能调。
 * 取景只有三个数（`coverZoom` / `coverX` / `coverY`），不是任意坐标 —— 版式的
 * 构图是设计出来的，允许无限拖会把版面拖散。三个数最后落成两个 CSS 属性
 * （`object-fit: cover` + `object-position`）加一个尺寸倍率，导出时
 * `html-to-image` 拿到的是同一份取值，预览与 PNG 不会不一致。
 *
 * 几何计算全在 `lib/export/poster/cover-frame`（纯函数、有断言）；这里只管事件：
 * 拖动（rAF 合帧，一帧最多一次 setState）、滚轮缩放、双击复位、方向键微调。
 * 交互只在预览侧开启：`PosterCanvas` 传了 `onCoverAdjust` 才会有这些行为；
 * 导出用的是同一个组件但不接这个回调。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clampCoverPosition,
  clampCoverZoom,
  coverOverflow,
  panCover,
  zoomCover,
  type CoverBox,
  type CoverFrame,
} from '@/lib/export/poster/cover-frame'
import { POSTER_COVER_POSITION_CENTER, type PosterOptions } from '@/lib/export/poster/types'

export interface PosterCoverPatch {
  coverZoom?: number
  coverX?: number
  coverY?: number
}

/** 预览侧注入的改写回调；导出侧是 `null`（静态渲染，不给交互）。 */
export const PosterCoverAdjustContext = createContext<((patch: PosterCoverPatch) => void) | null>(null)

/** 方向键一次挪可移动余量的百分之几（按住 Shift 走大步）。 */
const KEY_STEP = 2
const KEY_STEP_FAST = 8
const KEY_ZOOM_STEP = 0.1

interface DragState {
  pointerId: number
  clientX: number
  clientY: number
  frame: CoverFrame
  box: CoverBox
  /** 客户端 px → 画布 px（预览是缩放过的） */
  ratio: number
}

export interface PosterCoverProps {
  src: string
  options: Pick<PosterOptions, 'coverZoom' | 'coverX' | 'coverY'>
  className?: string
}

export function PosterCover({ src, options, className = '' }: PosterCoverProps) {
  const adjust = useContext(PosterCoverAdjustContext)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const frameIdRef = useRef<number | null>(null)
  const pendingRef = useRef<PosterCoverPatch | null>(null)
  // 事件回调里要读到最新取值，但不想每次 options 变化都重建监听
  // （在 effect 里同步，渲染过程中不写 ref）
  const latestRef = useRef(options)
  useEffect(() => {
    latestRef.current = options
  }, [options])
  /** 有没有可移动余量 —— 决定光标是不是抓手（铺满时拖不动，别给假承诺）。 */
  const [canPan, setCanPan] = useState(false)

  const zoom = clampCoverZoom(options.coverZoom)
  const x = clampCoverPosition(options.coverX)
  const y = clampCoverPosition(options.coverY)

  const measure = useCallback((): { box: CoverBox; ratio: number } | null => {
    const root = rootRef.current
    if (root === null) return null
    const rect = root.getBoundingClientRect()
    if (rect.width <= 0 || root.clientWidth <= 0) return null
    const image = imageRef.current
    return {
      box: {
        width: root.clientWidth,
        height: root.clientHeight,
        naturalWidth: image?.naturalWidth ?? 0,
        naturalHeight: image?.naturalHeight ?? 0,
      },
      ratio: root.clientWidth / rect.width,
    }
  }, [])

  /** 合帧：拖动 / 滚轮一帧最多推一次，React 不跟着 pointermove 的步伐抖。 */
  const schedule = useCallback(
    (patch: PosterCoverPatch): void => {
      if (adjust === null) return
      pendingRef.current = { ...pendingRef.current, ...patch }
      if (frameIdRef.current !== null) return
      frameIdRef.current = window.requestAnimationFrame(() => {
        frameIdRef.current = null
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending !== null && Object.keys(pending).length > 0) adjust(pending)
      })
    },
    [adjust],
  )

  const flush = useCallback((): void => {
    if (frameIdRef.current !== null) {
      window.cancelAnimationFrame(frameIdRef.current)
      frameIdRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending !== null && Object.keys(pending).length > 0) adjust?.(pending)
  }, [adjust])

  useEffect(() => () => flush(), [flush])

  // 余量决定光标：换图 / 缩放后重算。
  // 这里量的是 DOM（框尺寸 + 图的原尺寸），属于「读外部系统后同步一份本地状态」，
  // 不是纯派生 —— 只能放在 effect 里。
  useEffect(() => {
    if (adjust === null) return
    const measured = measure()
    if (measured === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步 DOM 量出来的结果
      setCanPan(false)
      return
    }
    // 余量与当前取景无关（只看框 / 原图 / 缩放）
    const overflow = coverOverflow({ zoom, x: 0, y: 0 }, measured.box)
    setCanPan(overflow.x > 0.5 || overflow.y > 0.5)
  }, [adjust, measure, zoom, src])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (adjust === null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const image = imageRef.current
    const measured = measure()
    if (image === null || measured === null || !image.complete) return

    const current = latestRef.current
    const frame: CoverFrame = {
      zoom: clampCoverZoom(current.coverZoom),
      x: clampCoverPosition(current.coverX),
      y: clampCoverPosition(current.coverY),
    }
    const overflow = coverOverflow(frame, measured.box)
    // 没有余量 = 已经铺满，先放大才谈得上移动
    if (overflow.x <= 0.5 && overflow.y <= 0.5) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      frame,
      box: measured.box,
      ratio: measured.ratio,
    }
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (adjust === null || drag === null || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.clientX) * drag.ratio
    const dy = (event.clientY - drag.clientY) * drag.ratio
    const next = panCover(drag.frame, drag.box, dx, dy)
    if (next.x === drag.frame.x && next.y === drag.frame.y) return
    schedule({ coverX: next.x, coverY: next.y })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    flush()
  }

  const reset = (): void => {
    flush()
    adjust?.({
      coverZoom: 1,
      coverX: POSTER_COVER_POSITION_CENTER,
      coverY: POSTER_COVER_POSITION_CENTER,
    })
  }

  // React 的 onWheel 挂在根节点上是 passive 的，preventDefault 会被忽略 → 用原生监听
  useEffect(() => {
    const root = rootRef.current
    if (root === null || adjust === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const current = latestRef.current
      const next = zoomCover(
        {
          zoom: clampCoverZoom(current.coverZoom),
          x: clampCoverPosition(current.coverX),
          y: clampCoverPosition(current.coverY),
        },
        event.deltaY,
      )
      if (Math.abs(next - current.coverZoom) < 0.005) return
      schedule({ coverZoom: next })
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [adjust, schedule])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (adjust === null) return
    const key = event.key
    if (key === '0') {
      event.preventDefault()
      reset()
      return
    }
    if (key === '+' || key === '=') {
      event.preventDefault()
      const current = clampCoverZoom(latestRef.current.coverZoom)
      schedule({ coverZoom: clampCoverZoom(current + KEY_ZOOM_STEP) })
      return
    }
    if (key === '-' || key === '_') {
      event.preventDefault()
      const current = clampCoverZoom(latestRef.current.coverZoom)
      schedule({ coverZoom: clampCoverZoom(current - KEY_ZOOM_STEP) })
      return
    }
    if (!key.startsWith('Arrow')) return

    const measured = measure()
    if (measured === null) return
    const frame: CoverFrame = {
      zoom: clampCoverZoom(latestRef.current.coverZoom),
      x: clampCoverPosition(latestRef.current.coverX),
      y: clampCoverPosition(latestRef.current.coverY),
    }
    const overflow = coverOverflow(frame, measured.box)
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP
    event.preventDefault()
    // 方向键 = 推画面：← 把画面往左推，于是看到更靠右的部分
    const dxPct = key === 'ArrowLeft' ? step : key === 'ArrowRight' ? -step : 0
    const dyPct = key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0
    const nextX = overflow.x > 0.5 ? clampCoverPosition(frame.x + dxPct) : frame.x
    const nextY = overflow.y > 0.5 ? clampCoverPosition(frame.y + dyPct) : frame.y
    if (nextX === frame.x && nextY === frame.y) return
    schedule({ coverX: nextX, coverY: nextY })
  }

  const editable = adjust !== null
  // 槽位自己决定定位方式：满幅封面传 `absolute inset-0`，内联槽位只给尺寸。
  // `relative` 不能无脑写死 —— Tailwind 里 `.relative` 排在 `.absolute` 之后，
  // 两个类同时在时永远是 relative 生效，满幅封面就会掉回文档流、把正文挤出画布。
  const positioned = /\babsolute\b/.test(className) ? '' : 'relative'

  return (
    <div
      ref={rootRef}
      data-poster-cover={editable ? 'editable' : 'static'}
      className={`${positioned} overflow-hidden ${
        editable
          ? `${canPan ? 'cursor-grab' : 'cursor-default'} touch-none outline-none active:cursor-grabbing`
          : ''
      } ${className}`}
      title={editable ? '拖动调整取景 · 滚轮缩放 · 双击复位' : undefined}
      tabIndex={editable ? 0 : undefined}
      role={editable ? 'group' : undefined}
      aria-label={editable ? '封面取景：拖动或方向键移动，滚轮或 +/- 缩放，双击复位' : undefined}
      onPointerDown={editable ? startDrag : undefined}
      onPointerMove={editable ? moveDrag : undefined}
      onPointerUp={editable ? endDrag : undefined}
      onPointerCancel={editable ? endDrag : undefined}
      onDoubleClick={editable ? reset : undefined}
      onKeyDown={editable ? onKeyDown : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 海报按导出尺寸直出，不走 next/image */}
      <img
        ref={imageRef}
        src={src}
        alt=""
        draggable={false}
        onLoad={() => {
          const measured = measure()
          if (measured === null) return
          const overflow = coverOverflow({ zoom, x, y }, measured.box)
          setCanPan(overflow.x > 0.5 || overflow.y > 0.5)
        }}
        className="absolute left-1/2 top-1/2 max-w-none select-none"
        style={{
          width: `${zoom * 100}%`,
          height: `${zoom * 100}%`,
          transform: 'translate(-50%, -50%)',
          objectFit: 'cover',
          objectPosition: `${x}% ${y}%`,
        }}
      />
    </div>
  )
}
