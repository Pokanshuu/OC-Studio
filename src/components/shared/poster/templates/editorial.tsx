'use client'

/**
 * 刊首 / editorial —— 艺术杂志：题头小字、大衬线标题、主视觉、两栏定义列表。
 *
 * 骨架随比例换（`auto`）：
 *   wide           左右分栏（文字在左、主视觉在右）
 *   portrait       上方大图 + 下方内页
 *   card / square  上方横幅主视觉（正文流短时图会自己撑高，不留空位）
 * 用户的 `coverPlacement` 覆盖时走通用分栏（top / left / right / background / hidden）。
 *
 * 正文块（基本信息 / 标签 / 时间 / 地点 / 简介 / 正文 / 关系 / 画廊）统一交给
 * `PosterFlow`（`variant="paper"`），顺序、显隐、对齐、列数、字号由共享积木决定。
 * 文字尺寸一律 `em`（根节点 `16 × fontScale`），标题字号再乘 `titleScale`。
 */
import type {
  PosterCoverPlacement,
  PosterRatio,
  PosterTone,
  PosterTemplateProps,
} from '@/lib/export/poster/types'
import { POSTER_BASE_FONT_SIZE, POSTER_PADDING, resolveFieldColumns, resolvePosterAlign } from '@/lib/export/poster/types'
import { POSTER_ALIGN_TEXT, PosterAliases, PosterFlow } from '@/components/shared/poster/blocks'
import { PosterCover } from '../PosterCover'

export const posterMeta = { name: '刊首', hint: '杂志封面' }

type Placement = 'top' | 'left' | 'right' | 'background' | 'hidden'

interface Palette {
  text: string
  muted: string
  faint: string
  line: string
}

function paletteFor(tone: PosterTone): Palette {
  if (tone === 'paper') {
    return { text: 'text-ink-fixed', muted: 'text-ink-fixed/70', faint: 'text-ink-fixed/45', line: 'border-ink-fixed/15' }
  }
  return { text: 'text-paper-fixed', muted: 'text-paper-fixed/70', faint: 'text-paper-fixed/45', line: 'border-paper-fixed/25' }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function resolvePlacement(placement: PosterCoverPlacement, ratio: PosterRatio): Placement {
  if (placement === 'auto') {
    if (ratio === 'wide') return 'right'
    return 'top'
  }
  switch (placement) {
    case 'top':
    case 'left':
    case 'right':
    case 'background':
    case 'hidden':
      return placement
    default:
      return 'top'
  }
}

export default function EditorialPoster({ data, options, width, height, tone, image }: PosterTemplateProps) {
  const palette = paletteFor(tone)
  const pad = POSTER_PADDING[options.padding]
  const wide = options.ratio === 'wide'
  const portrait = options.ratio === 'portrait'
  const square = options.ratio === 'square'

  const align = resolvePosterAlign(options.align, 'left')
  const alignText = POSTER_ALIGN_TEXT[align]
  const columns = resolveFieldColumns(options.fieldColumns, 2)
  const titleScale = clamp(options.titleScale, 0.8, 1.4)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const placement = resolvePlacement(options.coverPlacement, options.ratio)

  const coverSrc = options.showCover && data.cover ? image(data.cover) : ''
  const hasCover = coverSrc !== '' && placement !== 'hidden'

  const titleSize = `${((wide ? 2.6 : portrait ? 3.2 : 2.9) * titleScale).toFixed(2)}em`
  const bodyLines = wide ? 6 : square ? 8 : portrait ? 12 : 9

  const topBasis = percent(
    clamp((wide ? 0.34 : portrait ? 0.42 : 0.36) * coverScale, 0.2, 0.66),
  )
  const sideWidth = percent(
    clamp((wide ? 0.42 : portrait ? 0.32 : 0.35) * coverScale, 0.2, 0.62),
  )

  const coverImage = (className: string) => (
    <PosterCover src={coverSrc} options={options} className={className} />
  )

  const masthead = (
    <header className={`shrink-0 border-b pb-[0.7em] ${palette.line}`}>
      <span
        className={`block uppercase tracking-[0.3em] ${palette.muted} ${alignText}`}
        style={{ fontSize: '0.64em' }}
      >
        {data.kindLabel.trim() !== '' ? data.kindLabel : 'OC STUDIO'}
      </span>
    </header>
  )

  const title =
    data.title.trim() !== '' ? (
      <h1
        className={`font-serif font-bold leading-[1.06] tracking-[-0.02em] [overflow-wrap:anywhere] ${alignText}`}
        style={{ fontSize: titleSize }}
      >
        {data.title}
      </h1>
    ) : null

  const subtitle =
    data.subtitle.trim() !== '' ? (
      <p
        className={`mt-[0.55em] leading-[1.5] tracking-[0.06em] ${palette.muted} ${alignText}`}
        style={{ fontSize: '0.92em' }}
      >
        {data.subtitle}
      </p>
    ) : null

  const aliasLine = options.showAliases ? (
    <div className="mt-[0.4em]">
      <PosterAliases aliases={data.aliases} tone={tone} align={align} />
    </div>
  ) : null

  const flow = (
    <PosterFlow
      data={data}
      options={options}
      tone={tone}
      image={image}
      variant="paper"
      align={align}
      columns={columns}
      gap={1.2}
      maxFields={8}
      bodyLines={bodyLines}
    />
  )

  const signatureBar =
    options.showSignature && options.signature.trim() !== '' ? (
      <footer
        className={`mt-[1.1em] flex shrink-0 items-baseline justify-between gap-[1em] border-t pt-[0.65em] ${palette.line}`}
        style={{ fontSize: '0.62em' }}
      >
        <span className={`uppercase tracking-[0.26em] ${palette.muted}`}>{options.signature}</span>
        <span className={`tracking-[0.18em] ${palette.faint}`}>{data.templateName}</span>
      </footer>
    ) : null

  const sideCover = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-item ${wide ? 'self-stretch' : 'self-start'}`}
      style={wide ? { width: sideWidth } : { width: sideWidth, aspectRatio: '3 / 4' }}
    >
      {coverImage('absolute inset-0 h-full w-full')}
    </div>
  )

  const topMain = (
    <div className="flex min-h-0 flex-1 flex-col pt-[1.1em]">
      {hasCover ? (
        <div
          className="relative w-full overflow-hidden rounded-item"
          style={{ flex: `1 0 ${topBasis}`, minHeight: '26%' }}
        >
          {coverImage('absolute inset-0 h-full w-full')}
        </div>
      ) : null}
      <div className="mt-[1.2em] flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0">
          {title}
          {subtitle}
          {aliasLine}
        </div>
        <div className="mt-[1em] min-h-0 overflow-hidden">{flow}</div>
      </div>
    </div>
  )

  const sideMain = (side: 'left' | 'right') => (
    <div className="flex min-h-0 flex-1 gap-[2em] pt-[1.2em]">
      {hasCover && side === 'left' ? sideCover : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0">
          {title}
          {subtitle}
          {aliasLine}
        </div>
        <div className="mt-[1em] min-h-0 flex-1 overflow-hidden">{flow}</div>
      </div>
      {hasCover && side === 'right' ? sideCover : null}
    </div>
  )

  const plainMain = (
    <div className="flex min-h-0 flex-1 flex-col pt-[1.1em]">
      <div className="shrink-0">
        {title}
        {subtitle}
        {aliasLine}
      </div>
      <div className="mt-[1em] min-h-0 flex-1 overflow-hidden">{flow}</div>
    </div>
  )

  let main = plainMain
  if (hasCover) {
    if (placement === 'top') main = topMain
    else if (placement === 'left') main = sideMain('left')
    else if (placement === 'right') main = sideMain('right')
  }

  return (
    <div
      className={`relative flex flex-col overflow-hidden ${palette.text}`}
      style={{ width, height, padding: pad, fontSize: POSTER_BASE_FONT_SIZE * options.fontScale, boxSizing: 'border-box' }}
    >
      {hasCover && placement === 'background' ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            {coverImage('h-full w-full')}
          </div>
          <div className={`absolute inset-0 ${tone === 'paper' ? 'bg-paper-fixed/90' : 'bg-ink-fixed/90'}`} />
        </>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col">
        {masthead}
        {main}
        {signatureBar}
      </div>
    </div>
  )
}
