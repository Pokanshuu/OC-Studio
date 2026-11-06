'use client'

/**
 * 上下分栏（画廊视图用）：上半是 Cover Flow，下半是列表，**各自滚动**，中间可拖。
 *
 * 三条硬规矩：
 * 1. **有下限**：上栏最高只能到「下栏还剩 `minBottom`」，拖到底不会把下半彻底挤没
 * 2. **拖到底 = 收起**：继续往下拖（超过阈值）把下栏收成一条 24px 的小条，
 *    条上点一下（或往下拖）再展开回原来的高度 —— 收起后永远有路回来
 * 3. **高度持久化**：按视图各存一个 localStorage 键，双击分隔条复位
 *
 * 交互细节：拖动中只改本地 state、直接写 style；分隔条不画线，悬停才显 `--oc-hover`。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GripHorizontal } from 'lucide-react'

interface VerticalSplitProps {
  top: ReactNode
  bottom: ReactNode
  /** 初始上栏高度（px） */
  defaultTop?: number
  minTop?: number
  /** 下栏至少留多高（不再往下压） */
  minBottom?: number
  /** 拖过这条线就算「要收起」 */
  collapseThreshold?: number
  /** localStorage 键：给了就记住高度（按视图分别存） */
  storageKey?: string
  className?: string
}

/** 收起后那条小条的高度 */
const BAR_HEIGHT = 16

export function VerticalSplit({
  top,
  bottom,
  defaultTop = 320,
  minTop = 160,
  minBottom = 120,
  collapseThreshold = 48,
  storageKey,
  className = '',
}: VerticalSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [topHeight, setTopHeight] = useState<number>(() => {
    if (!storageKey || typeof window === 'undefined') return defaultTop
    const raw = Number(localStorage.getItem(storageKey))
    return Number.isFinite(raw) && raw > 0 ? raw : defaultTop
  })
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 拖动中的即时高度（`pointerup` 里要用，不能依赖 state 的闭包快照） */
  const heightRef = useRef(topHeight)
  useEffect(() => {
    heightRef.current = topHeight
  }, [topHeight])

  const bounds = useCallback((): { min: number; max: number } => {
    const total = containerRef.current?.clientHeight ?? 0
    if (total <= 0) return { min: minTop, max: Number.MAX_SAFE_INTEGER }
    // 下栏最多压到 `minBottom`；同时保证上栏至少还有 `minTop`
    const max = Math.max(minTop, total - minBottom)
    return { min: Math.min(minTop, max), max }
  }, [minTop, minBottom])

  const clamp = useCallback(
    (value: number): number => {
      const { min, max } = bounds()
      return Math.min(max, Math.max(min, value))
    },
    [bounds],
  )

  const persist = useCallback(
    (value: number) => {
      if (storageKey && typeof window !== 'undefined') localStorage.setItem(storageKey, String(Math.round(value)))
    },
    [storageKey],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const startY = event.clientY
    const startHeight = collapsed ? bounds().min : heightRef.current
    const total = container.clientHeight
    if (collapsed) setCollapsed(false)
    setDragging(true)

    let raw = startHeight

    const move = (moveEvent: PointerEvent): void => {
      raw = startHeight + (moveEvent.clientY - startY)
      setTopHeight(clamp(raw))
    }
    const up = (): void => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // 拖到底（或越过阈值）→ 收起；否则记住当前高度
      if (raw >= total - collapseThreshold) {
        setCollapsed(true)
      } else {
        const final = clamp(raw)
        setTopHeight(final)
        persist(final)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 容器尺寸变化（窗口缩放）时把上栏夹回合法区间
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setTopHeight((current) => clamp(current))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [clamp])

  return (
    <div ref={containerRef} className={`flex h-full min-h-0 flex-col ${className}`}>
      <div
        className="min-h-0 overflow-hidden"
        style={{ height: collapsed ? `calc(100% - ${BAR_HEIGHT}px)` : topHeight }}
      >
        {top}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-4 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
          title="展开列表"
          aria-label="展开列表"
        >
          <GripHorizontal size={12} strokeWidth={2} />
        </button>
      ) : (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整上下高度"
          title="拖动调整；拖到底收起，双击复位"
          onPointerDown={onPointerDown}
          onDoubleClick={() => {
            const next = clamp(defaultTop)
            setTopHeight(next)
            persist(next)
          }}
          className={`h-1.5 shrink-0 cursor-row-resize touch-none transition-colors hover:bg-[var(--oc-hover)] ${
            dragging ? 'bg-[var(--oc-hover)]' : ''
          }`}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" hidden={collapsed}>
        {bottom}
      </div>
    </div>
  )
}
