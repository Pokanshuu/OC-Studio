'use client'

/**
 * 模板预览的「海报版」：同一个真实预览数据，按 1080 宽重新排版，
 * 用 `html-to-image` 截成 PNG。它在屏幕外渲染，不参与编排层布局。
 */
import { forwardRef } from 'react'
import { resolveImageUrl } from '@/lib/image-service'
import {
  DEFAULT_IMAGE_EXPORT_OPTIONS,
  type ImageBackground,
  type ImageExportOptions,
  type ImagePadding,
  type ImageRatio,
} from '@/lib/export/presets'

export interface TemplatePosterData {
  title: string
  cover?: string
  fields: [string, string][]
  tags: string[]
  summary: string
  body: string
  templateName: string
}

export type PosterPadding = ImagePadding
export type PosterBackground = ImageBackground
export type TemplatePosterOptions = ImageExportOptions

export const DEFAULT_POSTER_OPTIONS = DEFAULT_IMAGE_EXPORT_OPTIONS

const PADDING: Record<PosterPadding, number> = {
  compact: 36,
  standard: 64,
  loose: 96,
}

/** 1080 宽下的目标高度：角色卡 3:4 · 方卡 1:1 · 竖版 9:16 */
const RATIO_HEIGHT: Record<ImageRatio, number> = {
  card: 1440,
  square: 1080,
  portrait: 1920,
}

export const TemplatePoster = forwardRef<
  HTMLDivElement,
  { data: TemplatePosterData; options?: TemplatePosterOptions }
>(function TemplatePoster({ data, options = DEFAULT_POSTER_OPTIONS }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        minHeight: RATIO_HEIGHT[options.ratio],
        padding: PADDING[options.padding],
        background: options.background === 'transparent' ? 'transparent' : 'var(--oc-paper)',
        color: 'var(--oc-ink)',
      }}
    >
      <div className="flex items-baseline justify-between gap-6 border-b border-line pb-5">
        <span className="font-serif text-[44px] font-bold leading-tight">{data.title}</span>
        <span className="shrink-0 text-[18px] text-ink-faint">{data.templateName}</span>
      </div>

      {options.showCover && data.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 导出时按真实图片路径取图
          <img
            src={resolveImageUrl(data.cover, 'cover')}
            alt=""
            className="mt-10 aspect-[3/2] w-full rounded-item object-cover"
          />
        ) : null}

        {options.showFields && data.fields.length > 0 ? (
          <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-4">
            {data.fields.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 border-b border-line pb-2">
                <span className="text-[16px] text-ink-faint">{label}</span>
                <span className="text-[20px]">{value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {options.showTags && data.tags.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {data.tags.map((tag) => (
              <span key={tag} className="rounded-item bg-paper-card px-3 py-1 text-[16px] text-ink-muted">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {options.showSummary && data.summary ? (
          <p className="mt-10 text-[20px] leading-8 text-ink-muted">{data.summary}</p>
        ) : null}

        {options.showBody && data.body ? (
          <p className="mt-6 whitespace-pre-line text-[18px] leading-8 text-ink-muted">{data.body}</p>
        ) : null}

        {options.showSignature ? (
          <div className="mt-14 flex items-center justify-between border-t border-line pt-4 text-[14px] text-ink-faint">
            <span>OC Studio</span>
            <span>{data.templateName}</span>
          </div>
        ) : null}
      </div>
    )
  },
)
