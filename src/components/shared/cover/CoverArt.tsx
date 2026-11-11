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

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MONO_DARK_TINT,
  MONO_LIGHT_TINT,
  NEUTRAL_TINT,
  loadCoverImage,
  readTokenColor,
  renderCover,
  useCoverTuning,
} from '@/lib/cover'
import { enqueueCoverRender } from '@/lib/cover/queue'
import { useIsDarkTheme } from '@/lib/use-theme'
import { useSettings } from '@/lib/settings'
import { observeCoverVisibility } from './cover-visibility'

interface CoverArtProps {
  /** 已解析的头图地址；空 = 没有头图，只画色块与衬线首字 */
  src?: string
  /** 没有头图时拿它取混色（头像 / 国徽） */
  tintSrc?: string
  /** 无照片时压在色块上的衬线首字 */
  watermark?: string
  /** 卡片比例覆盖（小说封面 2:3 这类）；不传就用调试面板的全局值 */
  aspect?: number
  /** 照片区高度（卡片高度 %）：小说书封整张铺满时单传 100 */
  photoHeight?: number
  /** 模糊起点（卡片高度比）：规范是「从标题开始」，由 CoverCard 量出来 */
  blurStart?: number
  /** 混色起点（卡片高度比）：规范是「从小字开始」 */
  mixStart?: number
}

export function CoverArt({ src, tintSrc, watermark, aspect, photoHeight, blurStart, mixStart }: CoverArtProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  const tuning = useCoverTuning()
  // 彩色 / 黑白是用户设置（设置 → 个性化），不是调试参数。
  // 黑白不是「固定墨色」：块色跟着主题走 —— 亮色主题是纸色，暗色主题才是墨色。
  const { settings } = useSettings()
  const isDark = useIsDarkTheme()
  const mono = settings.coverTintMode === 'mono'
  // 读 CSS 变量会触发一次样式计算，只随「模式 + 主题」变，别每次渲染都问
  const monoColor = useMemo(
    () => (mono ? readTokenColor('--oc-paper-card', isDark ? MONO_DARK_TINT : MONO_LIGHT_TINT) : undefined),
    [mono, isDark],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    /*
     * 「进入视口才画」的观察者与兜底计时器是**全站共用**的（`cover-visibility.ts`）：
     * 以前每张卡各建一个观察者 + 一个 1.2s 计时器，400 条时就是 400 份开销。
     */
    return observeCoverVisibility(host, () => setActive(true))
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
            tintMode: mono ? 'mono' : 'auto',
            monoColor,
            watermark,
            aspect: aspect ?? tuning.aspect,
            inset: tuning.inset / 100,
            photoHeight: (photoHeight ?? tuning.photoHeight) / 100,
            dissolve: tuning.dissolve / 100,
            blurStart,
            blur: tuning.blur,
            mixStart,
            mixPoint: 1,
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
  }, [active, src, tintSrc, tuning, mono, monoColor, watermark, aspect, photoHeight, blurStart, mixStart])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      /* 垫纸色而不是炭黑：卡片被提升成合成层（画廊的 3D transform）时，
         圆角裁切会在边 / 角漏 1px —— 漏出来的若是炭黑，就是四角那道黑边。 */
      className="absolute inset-0 bg-paper-card"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
