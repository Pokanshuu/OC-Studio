'use client'

/**
 * 素白 mono —— 极简排版。
 *
 * 全纸色，靠字号层级与留白撑住：顶部一行小字 + 一条 1px 线，名称最大（衬线 3–4em），
 * 封面只是一枚小方图 / 一条顶部图带，从不铺满。正文流走 `archive` 皮肤 ——
 * 一行「标签 · 值」、细线分隔，像一本独立杂志的扉页 / 一张名片。
 *
 * 封面位置支持 `top` / `left` / `right` / `hidden`；`background` 在这个版式里没有位置，
 * 退化到顶部图带（`auto` = 小方图在名称右侧）。
 * 背景层由外层负责，模板不铺底，只按 `tone` 取字色。
 */
import { PosterFlow, PosterAliases } from '@/components/shared/poster/blocks'
import { PosterCover } from '../PosterCover'
import {
  POSTER_BASE_FONT_SIZE,
  POSTER_PADDING,
  resolveFieldColumns,
  resolvePosterAlign,
  type PosterCoverPlacement,
  type PosterTemplateProps,
} from '@/lib/export/poster/types'

export const posterMeta = { name: '素白', hint: '极简排版' }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** mono 的封面支持集：顶部 / 左右小方图 / 不画；`background` 退化到顶部图带 */
function resolvePlacement(placement: PosterCoverPlacement): 'auto' | 'top' | 'left' | 'right' | 'hidden' {
  switch (placement) {
    case 'top':
    case 'left':
    case 'right':
    case 'hidden':
      return placement
    case 'background':
      return 'top'
    default:
      return 'auto'
  }
}

export default function MonoPoster({ data, options, width, height, tone, image }: PosterTemplateProps) {
  const wide = height < width
  const tall = height / width >= 1.5
  const step = wide ? 0.84 : tall ? 1.08 : 1
  const em = (n: number) => `${(n * step).toFixed(2)}em`

  const ink = tone === 'ink'
  const textColor = ink ? 'text-paper-fixed' : 'text-ink-fixed'
  const muted = ink ? 'text-paper-fixed/70' : 'text-ink-fixed/70'
  const faint = ink ? 'text-paper-fixed/45' : 'text-ink-fixed/45'
  const rule = ink ? 'border-paper-fixed/25' : 'border-ink-fixed/15'
  const blockBg = ink ? 'bg-paper-fixed/10' : 'bg-ink-fixed/[0.06]'

  const align = resolvePosterAlign(options.align, 'left')
  const columns = resolveFieldColumns(options.fieldColumns, 1)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const titleScale = clamp(options.titleScale, 0.8, 1.4)
  const placement = resolvePlacement(options.coverPlacement)

  const cover =
    options.showCover && options.coverPlacement !== 'hidden' && data.cover ? image(data.cover) : ''
  const hasCover = cover !== ''
  const topCover = hasCover && placement === 'top'
  const sideCover = hasCover && (placement === 'left' || placement === 'right' || placement === 'auto')
  const thumbSide: 'left' | 'right' = placement === 'left' ? 'left' : 'right'

  const title = data.title.trim()
  const subtitle = data.subtitle.trim()
  const signed = options.showSignature && options.signature.trim() !== ''
  const hasAliases = options.showAliases && data.aliases.some((alias) => alias.trim() !== '')

  const baseTitle = hasCover
    ? (wide ? 3.1 : tall ? 4 : 3.5) - 0.1
    : (wide ? 3.7 : tall ? 4.6 : 4.1) - 0.1
  const titleSize = `${(baseTitle * titleScale).toFixed(2)}em`
  const thumbEm = (wide ? 5 : tall ? 8.5 : 7) * coverScale
  const topHeight = Math.min(62, (wide ? 22 : 26) * coverScale)

  const thumb = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-item ${blockBg}`}
      style={{ width: em(thumbEm), aspectRatio: '1 / 1' }}
    >
      <PosterCover src={cover} options={options} className="absolute inset-0 h-full w-full" />
    </div>
  )

  return (
    <div
      className={`relative overflow-hidden ${textColor}`}
      style={{
        width,
        height,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        fontSize: POSTER_BASE_FONT_SIZE * options.fontScale,
        padding: POSTER_PADDING[options.padding],
      }}
    >
      <div className="relative flex h-full min-h-0 flex-col" style={{ zIndex: 1 }}>
        {/* 题头小字 + 一条 1px 线 */}
        <div
          className={`flex shrink-0 border-b pb-[0.55em] ${rule}`}
          style={{
            justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          }}
        >
          {data.kindLabel.trim() !== '' ? (
            <span className="truncate uppercase" style={{ fontSize: em(0.52), letterSpacing: '0.4em' }}>
              {data.kindLabel}
            </span>
          ) : null}
        </div>

        {topCover ? (
          <div
            className={`relative shrink-0 overflow-hidden rounded-item ${blockBg}`}
            style={{ height: `${topHeight}%`, marginTop: em(1.2) }}
          >
            <PosterCover src={cover} options={options} className="absolute inset-0 h-full w-full" />
          </div>
        ) : null}

        {/* 名称：全篇最大的一档；小方图按封面位置落在名称左 / 右 */}
        <div className="flex shrink-0 items-start" style={{ gap: em(1.4), marginTop: em(1.6) }}>
          {sideCover && thumbSide === 'left' ? thumb : null}
          <div className="min-w-0 flex-1" style={{ textAlign: align }}>
            {title !== '' ? (
              <h1
                className="font-serif font-bold"
                style={{ fontSize: titleSize, lineHeight: 1.1, letterSpacing: '0.02em', overflowWrap: 'anywhere' }}
              >
                {title}
              </h1>
            ) : null}
            {subtitle !== '' ? (
              <p className={`truncate ${muted}`} style={{ marginTop: em(0.55), fontSize: em(0.88), letterSpacing: '0.2em' }}>
                {subtitle}
              </p>
            ) : null}
            {hasAliases ? (
              <div style={{ marginTop: em(0.35) }}>
                <PosterAliases aliases={data.aliases} tone={tone} align={align} />
              </div>
            ) : null}
          </div>
          {sideCover && thumbSide === 'right' ? thumb : null}
        </div>

        {/* 正文流：顺序 / 显隐 / 对齐 / 列数 / 字号由共享积木统一给 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ marginTop: em(1.1) }}>
          <PosterFlow
            data={data}
            options={options}
            tone={tone}
            image={image}
            variant="archive"
            align={align}
            columns={columns}
            gap={1}
            maxFields={6}
            bodyLines={wide ? 4 : tall ? 6 : 5}
          />
        </div>

        {signed ? (
          <div
            className={`flex shrink-0 items-baseline justify-between border-t ${rule}`}
            style={{ gap: em(1), paddingTop: em(0.55), fontSize: em(0.5), letterSpacing: '0.32em' }}
          >
            <span className="truncate">{options.signature}</span>
            <span className={`shrink-0 truncate ${faint}`}>{data.templateName}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
