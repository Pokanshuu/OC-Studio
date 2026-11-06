'use client'

/**
 * 胶片 frame —— 电影画幅。
 *
 * 封面是画面主体，外面一圈极细画框、内侧再留出呼吸区；标题落在画面下方，衬线、字距略宽，
 * 上面一行全大写小字（`A FILM OF …`）。正文流走 `cinematic` 皮肤 —— 字段是一条横向字幕条。
 * 横幅收紧、竖版放松 —— 同一份排版在 16:9 与 9:16 之间只调这一档。
 *
 * 封面位置只支持 `top` / `background` / `hidden`：左右侧栏在这个版式里没有位置，
 * 退化到顶部（`left` / `right` 都按 `top` 处理）。
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

export const posterMeta = { name: '胶片', hint: '电影画幅' }

/** 画框线与图之间留出的呼吸区（相对根 em） */
const FRAME_INSET = 0.8

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** frame 的封面支持集：顶部 / 背景 / 不画；左右栏退化到顶部 */
function resolvePlacement(placement: PosterCoverPlacement): 'auto' | 'top' | 'background' | 'hidden' {
  switch (placement) {
    case 'top':
    case 'background':
    case 'hidden':
      return placement
    case 'left':
    case 'right':
      return 'top'
    default:
      return 'auto'
  }
}

export default function FramePoster({ data, options, width, height, tone, image }: PosterTemplateProps) {
  const wide = height < width
  const tall = height / width >= 1.5
  const step = wide ? 0.82 : tall ? 1.12 : 1
  const em = (n: number) => `${(n * step).toFixed(2)}em`

  const ink = tone === 'ink'
  const textColor = ink ? 'text-paper-fixed' : 'text-ink-fixed'
  const muted = ink ? 'text-paper-fixed/70' : 'text-ink-fixed/70'
  const faint = ink ? 'text-paper-fixed/45' : 'text-ink-fixed/45'
  const rule = ink ? 'border-paper-fixed/25' : 'border-ink-fixed/15'
  const frameRule = ink ? 'border-paper-fixed/35' : 'border-ink-fixed/15'
  const hairline = ink ? 'bg-paper-fixed/25' : 'bg-ink-fixed/15'
  const wash = ink ? 'bg-ink-fixed/60' : 'bg-paper-fixed/60'

  const align = resolvePosterAlign(options.align, 'left')
  const columns = resolveFieldColumns(options.fieldColumns, 1)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const titleScale = clamp(options.titleScale, 0.8, 1.4)
  const placement = resolvePlacement(options.coverPlacement)

  const cover =
    options.showCover && options.coverPlacement !== 'hidden' && data.cover ? image(data.cover) : ''
  const hasCover = cover !== ''
  const autoCover = hasCover && placement === 'auto'
  const topCover = hasCover && placement === 'top'
  const backgroundCover = hasCover && placement === 'background'

  const title = data.title.trim()
  const subtitle = data.subtitle.trim()
  const signed = options.showSignature && options.signature.trim() !== ''
  const kicker = data.kindLabel.trim() ? `A FILM OF ${data.kindLabel.trim()}` : 'A FILM'

  const baseTitle = (wide ? 3.05 : tall ? 3.4 : 2.9) + (hasCover ? 0 : 0.25)
  const titleSize = `${(baseTitle * titleScale).toFixed(2)}em`
  const topHeight = Math.min(70, (wide ? 40 : 46) * coverScale)

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
      {backgroundCover ? (
        <>
          <PosterCover src={cover} options={options} className="absolute inset-0 h-full w-full" />
          <div className={`absolute inset-0 ${wash}`} />
        </>
      ) : null}

      <div className="relative flex h-full min-h-0 flex-col" style={{ zIndex: 1 }}>
        {/* 片头小字：全大写 + 大字距，时间 / 地点在正文流里 */}
        <header className={`flex shrink-0 items-center border-b pb-[0.6em] ${rule}`} style={{ gap: em(1.4) }}>
          <span className="min-w-0 truncate uppercase" style={{ fontSize: em(0.55), letterSpacing: '0.34em' }}>
            {kicker}
          </span>
          <span className={`h-px min-w-[2em] flex-1 ${hairline}`} />
        </header>

        {/* 画面主体：一条极细画框，图缩在里面，四周留出画框的呼吸区 */}
        {autoCover ? (
          <div
            className={`relative min-h-0 border ${frameRule}`}
            style={{ flex: 1.2 * coverScale, margin: `${em(1)} 0`, padding: em(FRAME_INSET) }}
          >
            <PosterCover src={cover} options={options} className="h-full w-full" />
          </div>
        ) : null}

        {topCover ? (
          <div
            className={`relative shrink-0 overflow-hidden border ${frameRule}`}
            style={{ height: `${topHeight}%`, margin: `${em(1)} 0`, padding: em(FRAME_INSET) }}
          >
            <PosterCover src={cover} options={options} className="h-full w-full" />
          </div>
        ) : null}

        {/* 标题：衬线、字距略宽，落在画面下方 */}
        {title !== '' ? (
          <h1
            className="shrink-0 font-serif font-bold"
            style={{
              marginTop: hasCover ? 0 : em(0.5),
              fontSize: titleSize,
              lineHeight: 1.16,
              letterSpacing: '0.14em',
              overflowWrap: 'anywhere',
              textAlign: align,
            }}
          >
            {title}
          </h1>
        ) : null}

        {subtitle !== '' ? (
          <p
            className={`shrink-0 truncate ${muted}`}
            style={{ marginTop: em(0.45), fontSize: em(0.72), letterSpacing: '0.3em', textAlign: align }}
          >
            {subtitle}
          </p>
        ) : null}

        {options.showAliases && data.aliases.some((alias) => alias.trim() !== '') ? (
          <div className="shrink-0" style={{ marginTop: em(0.35) }}>
            <PosterAliases aliases={data.aliases} tone={tone} align={align} />
          </div>
        ) : null}

        {/* 正文流：顺序 / 显隐 / 对齐 / 字号由共享积木统一给 */}
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ marginTop: em(0.85) }}>
          <PosterFlow
            data={data}
            options={options}
            tone={tone}
            image={image}
            variant="cinematic"
            align={align}
            columns={columns}
            gap={wide ? 0.9 : 1.15}
            maxFields={4}
            bodyLines={wide ? 4 : tall ? 8 : 5}
          />
        </div>

        {signed ? (
          <footer
            className={`flex shrink-0 items-baseline justify-between border-t ${rule}`}
            style={{
              gap: em(1),
              marginTop: em(1.1),
              paddingTop: em(0.55),
              fontSize: em(0.52),
              letterSpacing: '0.28em',
            }}
          >
            <span className="truncate">{options.signature}</span>
            <span className={`shrink-0 truncate ${faint}`}>{data.templateName}</span>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
