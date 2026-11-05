'use client'

/**
 * 夜色 / noir —— 电影海报：封面铺底 + 自下而上的重渐变，标题压在底部，文字克制。
 *
 * 固定墨底浅字：有封面时用封面当底（`background`），也可以被用户挪到顶部（`top`）；
 * 没有封面 / `hidden` 时用纯墨色 + 极淡的径向光。
 *
 * 正文块统一交给 `PosterFlow`（`variant="cinematic"`），顺序 / 显隐 / 对齐 / 字号由共享积木决定。
 * 文字尺寸一律 `em`（根节点 `16 × fontScale`），标题字号再乘 `titleScale`。
 */
import type { PosterCoverPlacement, PosterTemplateProps } from '@/lib/export/poster/types'
import { POSTER_BASE_FONT_SIZE, POSTER_PADDING, resolveFieldColumns, resolvePosterAlign } from '@/lib/export/poster/types'
import { POSTER_ALIGN_TEXT, PosterAliases, PosterFlow } from '@/components/shared/poster/blocks'
import { PosterCover } from '../PosterCover'

export const posterMeta = { name: '夜色', hint: '电影海报', tone: 'ink' } as const

type Placement = 'background' | 'top' | 'hidden'

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function resolvePlacement(placement: PosterCoverPlacement): Placement {
  if (placement === 'top' || placement === 'hidden') return placement
  if (placement === 'left' || placement === 'right') return 'top'
  return 'background'
}

export default function NoirPoster({ data, options, width, height, image }: PosterTemplateProps) {
  const pad = POSTER_PADDING[options.padding]
  const wide = options.ratio === 'wide'
  const portrait = options.ratio === 'portrait'

  const align = resolvePosterAlign(options.align, 'left')
  const alignText = POSTER_ALIGN_TEXT[align]
  const columns = resolveFieldColumns(options.fieldColumns, 2)
  // 固定墨底：正文流一律按浅字渲染，不跟随画布背景选项
  const tone = 'ink' as const

  const titleScale = clamp(options.titleScale, 0.8, 1.4)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const placement = resolvePlacement(options.coverPlacement)

  const coverSrc = options.showCover && data.cover ? image(data.cover) : ''
  const hasCover = coverSrc !== '' && placement !== 'hidden'

  const titleSize = `${((wide ? 3 : portrait ? 4 : 3.4) * titleScale).toFixed(2)}em`
  const bodyLines = wide ? 6 : portrait ? 12 : 8
  const topHeight = percent(clamp((wide ? 0.38 : 0.42) * coverScale, 0.2, 0.68))

  const coverImage = (className: string) => (
    <PosterCover src={coverSrc} options={options} className={className} />
  )

  const title =
    data.title.trim() !== '' ? (
      <h1
        className={`font-serif font-bold leading-[0.98] tracking-[-0.02em] text-paper-fixed [overflow-wrap:anywhere] ${alignText}`}
        style={{ fontSize: titleSize }}
      >
        {data.title}
      </h1>
    ) : null

  const subtitle =
    data.subtitle.trim() !== '' ? (
      <p className={`tracking-[0.14em] text-paper-fixed/75 ${alignText}`} style={{ fontSize: '0.86em' }}>
        {data.subtitle}
      </p>
    ) : null

  const aliasLine = options.showAliases ? <PosterAliases aliases={data.aliases} tone={tone} align={align} /> : null

  const flow = (
    <PosterFlow
      data={data}
      options={options}
      tone={tone}
      image={image}
      variant="cinematic"
      align={align}
      columns={columns}
      gap={0.85}
      maxFields={8}
      bodyLines={bodyLines}
    />
  )

  const signatureBar =
    options.showSignature && options.signature.trim() !== '' ? (
      <div
        className="flex shrink-0 items-baseline justify-between gap-[1em] border-t border-paper-fixed/15 pt-[0.55em]"
        style={{ fontSize: '0.56em' }}
      >
        <span className="uppercase tracking-[0.3em] text-paper-fixed/45">{options.signature}</span>
        <span className="tracking-[0.18em] text-paper-fixed/35">{data.templateName}</span>
      </div>
    ) : null

  const topCover = (
    <div className="relative w-full shrink-0 overflow-hidden rounded-item" style={{ height: topHeight }}>
      {coverImage('absolute inset-0 h-full w-full')}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-fixed to-transparent" />
    </div>
  )

  return (
    <div
      className="relative overflow-hidden bg-ink-fixed text-paper-fixed"
      style={{ width, height, padding: pad, fontSize: POSTER_BASE_FONT_SIZE * options.fontScale, boxSizing: 'border-box' }}
    >
      <div
        className="absolute inset-0 opacity-[0.09]"
        style={{
          background: 'radial-gradient(ellipse 72% 55% at 50% 28%, var(--oc-paper-fixed) 0%, transparent 72%)',
        }}
      />

      {hasCover && placement === 'background' ? (
        <>
          {coverImage('absolute inset-0 h-full w-full')}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-fixed via-ink-fixed/85 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-[36%] bg-gradient-to-b from-ink-fixed/75 to-transparent" />
        </>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col">
        {hasCover && placement === 'top' ? topCover : null}

        <div className="flex min-h-0 flex-1 flex-col gap-[1em]">
          <div className={`shrink-0 uppercase tracking-[0.34em] text-paper-fixed/60 ${alignText}`} style={{ fontSize: '0.62em' }}>
            {data.kindLabel.trim() !== '' ? data.kindLabel : 'OC STUDIO'}
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-end">
            <div className="flex min-h-0 flex-col gap-[0.7em] overflow-hidden">
              {title}
              {subtitle}
              {aliasLine}
              <div className="min-h-0 overflow-hidden pt-[0.2em]">{flow}</div>
              {signatureBar}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
