'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, startTransition, type RefObject, type Dispatch, type SetStateAction } from 'react'
import {
  LEFT_PADDING,
  RIGHT_PADDING,
  MIN_PX_PER_YEAR,
  MAX_PX_PER_YEAR,
  ZOOM_SNAP_STEP,
} from '../constants'
import type { useTimelineLayout } from './useTimelineLayout'

type Layout = ReturnType<typeof useTimelineLayout>

/**
 * 时间线的**视口/交互层**：容器滚动、缩放（滑杆 / ctrl+滚轮 / 双指捏合）、
 * 以及「上一件 / 下一件」导航。
 *
 * 只负责「看到哪一段」，不负责「有什么内容」—— 内容与坐标在 useTimelineLayout。
 * 输入依赖派生层的输出（yearRange / totalWidth / displayPxPerYear / navTargets），
 * 因此必须在 useTimelineLayout 之后调用。
 */
export function useTimelineViewport({
  scrollRef,
  containerWidth,
  zoomRatio,
  setZoomRatio,
  yearRange,
  autoPxPerYear,
  displayPxPerYear,
  totalWidth,
  navTargets,
  hasEvents,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  containerWidth: number
  zoomRatio: number
  setZoomRatio: Dispatch<SetStateAction<number>>
  yearRange: Layout['yearRange']
  autoPxPerYear: number
  displayPxPerYear: number
  totalWidth: number
  navTargets: Layout['navTargets']
  hasEvents: boolean
}) {
  const [navEdge, setNavEdge] = useState({ prev: true, next: false })
  const zoomOffsetRef = useRef(0)
  const zoomOriginRef = useRef(0)
  const oldScaleRef = useRef(0)
  const didZoomRef = useRef(false)
  const zoomRatioRef = useRef(zoomRatio)
  // 事件处理器读的是「最新一次提交的缩放比」。按 React 规则不在 render 期写 ref，
  // 放到 layout effect（处理器总是在提交之后才会被调用）。
  useLayoutEffect(() => {
    zoomRatioRef.current = zoomRatio
  }, [zoomRatio])
  const pinchRef = useRef<{ active: boolean; initialDistance: number; initialZoomRatio: number }>({
    active: false,
    initialDistance: 0,
    initialZoomRatio: 0,
  })
  const pinchRafRef = useRef(0)
  const latestPinchRef = useRef(0)
  const suppressScrollRef = useRef(false)
  const initialZoomSetRef = useRef(false)

  useEffect(() => {
    if (initialZoomSetRef.current) return
    if (!yearRange || containerWidth <= 0) return

    const availableWidth = containerWidth - LEFT_PADDING - RIGHT_PADDING
    if (availableWidth <= 0) return

    const raw = availableWidth / yearRange.totalYears
    const autoPx = Math.max(MIN_PX_PER_YEAR, Math.min(MAX_PX_PER_YEAR, raw))

    if (autoPx < 40) {
      const targetRatio = Math.min(Math.ceil(40 / autoPx), 5.0)
      // 一次性的「按测量宽度定初值」：容器宽度来自 ResizeObserver（外部系统），挂载时
      // 不可知；initialZoomSetRef 保证只执行一次，不会级联渲染。注意：若 lint 重新报出
      // set-state-in-effect，请勿改写为派生值 —— 那会让窗口缩放重新 fit，改变现有行为。
      setZoomRatio(targetRatio)
    }

    initialZoomSetRef.current = true
  }, [containerWidth, yearRange, setZoomRatio])

  const displayPxRef = useRef(displayPxPerYear)
  // displayPxRef 只被事件处理器读；oldScaleRef 被下面的滚动补偿 effect 读。
  // 两者都不需要「渲染期」写入，放 layout effect 即可 —— layout effect 先于
  // passive effect 执行，滚动补偿读到的仍是本次提交对应的值。
  useLayoutEffect(() => {
    displayPxRef.current = displayPxPerYear
    if (!didZoomRef.current) {
      oldScaleRef.current = displayPxPerYear
    }
  }, [displayPxPerYear])

  const applyZoom = useCallback((newRatio: number, originX: number) => {
    const container = scrollRef.current
    if (container) {
      zoomOriginRef.current = originX
      zoomOffsetRef.current = container.scrollLeft + originX - LEFT_PADDING
      oldScaleRef.current = displayPxRef.current
      didZoomRef.current = true
    }
    startTransition(() => { setZoomRatio(Math.max(0.1, Math.min(5.0, newRatio))) })
  }, [scrollRef, setZoomRatio])
  const isFirstEvent = navTargets.length <= 1 || navEdge.prev
  const isLastEvent = navTargets.length <= 1 || navEdge.next

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let raf = 0
    function updateEdge(): void {
      const container = scrollRef.current
      if (!container) return
      const sl = container.scrollLeft
      const maxScroll = container.scrollWidth - container.clientWidth
      const prev = sl <= 1
      const next = sl >= maxScroll - 1

      if (suppressScrollRef.current) return

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setNavEdge({ prev, next })
      })
    }

    updateEdge()
    el.addEventListener('scroll', updateEdge, { passive: true })
    return () => {
      el.removeEventListener('scroll', updateEdge)
      cancelAnimationFrame(raf)
    }
  }, [totalWidth, scrollRef])

  const navigateToEvent = useCallback(
    (direction: 'prev' | 'next') => {
      const container = scrollRef.current
      if (!container || navTargets.length < 2) return

      const viewCenter = container.scrollLeft + container.clientWidth / 2

      let nearestIdx = 0
      let nearestDist = Infinity
      for (let i = 0; i < navTargets.length; i++) {
        const dist = Math.abs(navTargets[i].x - viewCenter)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestIdx = i
        }
      }

      const targetIdx =
        direction === 'prev'
          ? Math.max(0, nearestIdx - 1)
          : Math.min(navTargets.length - 1, nearestIdx + 1)

      if (targetIdx === nearestIdx) return

      const targetX = navTargets[targetIdx].x
      container.scrollTo({
        left: Math.max(0, targetX - container.clientWidth / 2),
        behavior: 'smooth',
      })
    },
    [navTargets, scrollRef],
  )

  const handleZoomChange = useCallback(
    (value: number) => {
      applyZoom(value / 100, scrollRef.current?.clientWidth ? scrollRef.current.clientWidth / 2 : 0)
    },
    [applyZoom, scrollRef],
  )

  const handleZoomCommit = useCallback(
    (value: number) => {
      const px = autoPxPerYear * (value / 100)
      const snapped = Math.round(px / ZOOM_SNAP_STEP) * ZOOM_SNAP_STEP
      const snappedRatio = snapped / autoPxPerYear
      applyZoom(snappedRatio, scrollRef.current?.clientWidth ? scrollRef.current.clientWidth / 2 : 0)
    },
    [autoPxPerYear, applyZoom, scrollRef],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const origin = e.clientX - rect.left
        const newRatio = zoomRatioRef.current - e.deltaY * 0.005
        applyZoom(newRatio, origin)
      } else {
        e.preventDefault()
        el.scrollLeft += e.deltaX + e.deltaY
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [hasEvents, applyZoom, scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const getTouchDistance = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        el.style.touchAction = 'none'
        const dist = getTouchDistance(e.touches)
        latestPinchRef.current = dist
        pinchRef.current = {
          active: true,
          initialDistance: dist,
          initialZoomRatio: zoomRatioRef.current,
        }
        const rect = el.getBoundingClientRect()
        const origin = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        zoomOriginRef.current = origin
        zoomOffsetRef.current = el.scrollLeft + origin - LEFT_PADDING
        oldScaleRef.current = displayPxRef.current
        didZoomRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return
      e.preventDefault()
      latestPinchRef.current = getTouchDistance(e.touches)
      const rect = el.getBoundingClientRect()
      zoomOriginRef.current = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      if (pinchRafRef.current) return
      pinchRafRef.current = requestAnimationFrame(() => {
        pinchRafRef.current = 0
        const scale = latestPinchRef.current / pinchRef.current.initialDistance
        const newRatio = pinchRef.current.initialZoomRatio * scale
        applyZoom(newRatio, zoomOriginRef.current)
      })
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current.active = false
        el.style.touchAction = 'pan-x'
      }
      if (e.touches.length === 0) {
        const sl = el.scrollLeft
        const maxScroll = el.scrollWidth - el.clientWidth
        setNavEdge({ prev: sl <= 1, next: sl >= maxScroll - 1 })
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      if (pinchRafRef.current) {
        cancelAnimationFrame(pinchRafRef.current)
        pinchRafRef.current = 0
      }
      el.style.touchAction = ''
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [hasEvents, applyZoom, scrollRef])

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const oldScale = oldScaleRef.current
    oldScaleRef.current = displayPxPerYear
    didZoomRef.current = false
    if (oldScale === displayPxPerYear) return

    const newScroll = LEFT_PADDING + zoomOffsetRef.current * (displayPxPerYear / oldScale) - zoomOriginRef.current
    suppressScrollRef.current = true
    container.scrollLeft = newScroll
    requestAnimationFrame(() => { suppressScrollRef.current = false })
  }, [displayPxPerYear, scrollRef])
  return { isFirstEvent, isLastEvent, navigateToEvent, handleZoomChange, handleZoomCommit }
}


