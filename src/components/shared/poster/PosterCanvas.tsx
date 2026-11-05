'use client'

/**
 * 一张海报的完整画布：背景层 + 版式层。
 *
 * 预览与导出**用同一个组件**（`ImageExportDialog` 的旧做法），区别只是外面套不套缩放。
 * 画布尺寸固定 1080 宽，高度由 `POSTER_RATIOS` 给出；模板根节点必须正好占满，
 * 这条契约在 `types.ts` 顶部写死。
 */
import { forwardRef } from 'react'
import { resolveImageUrl } from '@/lib/image-service'
import {
  POSTER_RATIOS,
  posterTone,
  type PosterData,
  type PosterOptions,
} from '@/lib/export/poster/types'
import { posterTemplateOf } from './registry'
import { PosterBackdrop } from './PosterBackdrop'
import { PosterCoverAdjustContext, type PosterCoverPatch } from './PosterCover'

export interface PosterCanvasProps {
  data: PosterData
  options: PosterOptions
  className?: string
  /**
   * 预览侧注入：拖动 / 滚轮改封面取景。导出侧不传 = 静态渲染，
   * 这样 PNG 里不会留下任何交互态。
   */
  onCoverAdjust?: (patch: PosterCoverPatch) => void
}

export const PosterCanvas = forwardRef<HTMLDivElement, PosterCanvasProps>(function PosterCanvas(
  { data, options, className = '', onCoverAdjust },
  ref,
) {
  const meta = posterTemplateOf(options.template)
  const tone = posterTone(meta, options)
  const { width, height } = POSTER_RATIOS[options.ratio]
  const Template = meta.component
  const image = (src: string): string => resolveImageUrl(src, 'gallery')

  return (
    <div
      ref={ref}
      data-poster-canvas={options.template}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height, backgroundColor: 'transparent' }}
    >
      <PosterBackdrop background={options.background} data={data} image={image} tone={tone} />
      <PosterCoverAdjustContext.Provider value={onCoverAdjust ?? null}>
        <Template
          data={data}
          options={options}
          width={width}
          height={height}
          tone={tone}
          image={image}
        />
      </PosterCoverAdjustContext.Provider>
    </div>
  )
})
