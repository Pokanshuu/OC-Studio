'use client'

/**
 * 封面卡的画布。
 *
 * - 进视口才画（`IntersectionObserver` + 280px 提前量），看不见的卡片一个像素都不算；
 * - 宽度变了（窗格 / 分栏 / 参数）才重画，且 140ms 防抖；
 * - 画布尺寸按 CSS 宽度 × 设备像素比算，最长边封顶（卡片很小，不必原生分辨率）；
 * - 画布下面垫着中性炭黑 —— 服务端与首帧一致，不会闪一下白纸；
 * - 版式参数来自 `lib/cover/tuning.ts`，面板拖动时这里跟着重画。
 */

import { useEffect, useRef, useState } from 'react'
import { NEUTRAL_TINT, loadCoverImage, renderCover, useCoverTuning } from '@/lib/cover'
import { enqueueCoverRender } from '@/lib/cover/queue'
import { useSettings } from '@/lib/settings'

interface CoverArtProps {
  /** 已解析的头图地址；空 = 没有头图，只画色块与衬线首字 */
  src?: string
  /** 没有头图时拿它取混色（头像 / 国徽） */
  tintSrc?: string
  /** 无照片时压在色块上的衬线首字 */
  watermark?: string
}

export function CoverArt({ src, tintSrc, watermark }: CoverArtProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  const tuning = useCoverTuning()
  // 彩色 / 黑白是用户设置（设置 → 封面卡混色），不是调试参数
  const { settings } = useSettings()
  const tintMode = settings.coverTintMode

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (typeof IntersectionObserver === 'undefined') {
      // 老 WebView 没有 IntersectionObserver：下一帧直接画，别在 effect 里同步 setState
      const frame = requestAnimationFrame(() => setActive(true))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true)
          observer.disconnect()
        }
      },
      { rootMargin: '280px 0px' },
    )
    observer.observe(host)

    /*
     * 兜底：IntersectionObserver 的回调依赖渲染生命周期。刚被 `display:none` 挡住、
     * 在一开始就滚出视口的容器里、以及无头浏览器里都可能一次都不来 ——
     * 那样卡片会永远空着（只剩底色）。1.2s 后自己量一次矩形，在视口附近就直接画。
     */
    const guard = window.setTimeout(() => {
      const rect = host.getBoundingClientRect()
      const near =
        rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight + 280 && rect.bottom > -280
      if (!near) return
      setActive(true)
      observer.disconnect()
    }, 1200)

    return () => {
      window.clearTimeout(guard)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let cancelled = false
    let lastWidth = 0
    let timer: number | undefined

    const paint = (width: number): void => {
      lastWidth = width
      const cover = src ? loadCoverImage(src) : Promise.resolve(null)
      const tintOnly = !src && tintSrc ? loadCoverImage(tintSrc) : Promise.resolve(null)
      void Promise.all([cover, tintOnly]).then(([image, tintImage]) => {
        if (cancelled) return
        enqueueCoverRender(canvas, () => {
          if (cancelled) return
          renderCover(canvas, width, image, {
            fallbackTint: NEUTRAL_TINT,
            tintImage,
            tintMode,
            watermark,
            aspect: tuning.aspect,
            inset: tuning.inset / 100,
            photoHeight: tuning.photoHeight / 100,
            blurStart: tuning.blurStart / 100,
            blur: tuning.blur,
            mixStart: tuning.mixStart / 100,
            mixPoint: tuning.mixPoint / 100,
            grain: tuning.grain / 100,
          })
        })
      })
    }

    const initial = host.clientWidth
    if (initial > 0) paint(initial)

    const resize = new ResizeObserver(() => {
      const width = host.clientWidth
      if (width <= 0 || Math.abs(width - lastWidth) < 6) return
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = undefined
        if (!cancelled) paint(host.clientWidth)
      }, 140)
    })
    resize.observe(host)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
      resize.disconnect()
    }
  }, [active, src, tintSrc, tuning, tintMode, watermark])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="absolute inset-0"
      style={{ backgroundColor: NEUTRAL_TINT }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
