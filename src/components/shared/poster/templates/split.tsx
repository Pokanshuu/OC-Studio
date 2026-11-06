'use client'

/**
 * 双栏 split —— 非对称网格。
 *
 * 左栏 40% 满高放封面（无圆角、贴边出血），右栏放文字；横幅比例默认改成上下 ——
 * 图是一条通栏带，文字在下方。没有封面时那一栏不留空：一条细线 + 一个衬线大首字。
 * 右栏：题头小字 → 名称 → 一条线 → 正文流（基本信息两栏 / 简介 / 标签…）。
 * 正文流走 `paper` 皮肤 —— 字段是标签在上、值在下的两栏定义表。
 *
 * 封面位置支持 `left` / `right` / `top` / `background` / `hidden`，`auto` 按比例取
 * （横幅 → 顶部通栏，其余 → 左栏）。
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

export const posterMeta = { name: '双栏', hint: '非对称网格' }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** split 的封面落点：左右侧栏 / 顶部通栏 / 满铺背景；没有图时 `background` 退回分栏 */
function resolveLayout(
  placement: PosterCoverPlacement,
  stacked: boolean,
  hasCover: boolean,
): 'left' | 'right' | 'top' | 'background' {
  switch (placement) {
    case 'left':
    case 'right':
    case 'top':
      return placement
    case 'background':
      return hasCover ? 'background' : stacked ? 'top' : 'left'
    default:
      return stacked ? 'top' : 'left'
  }
}

export default function SplitPoster({ data, options, width, height, tone, image }: PosterTemplateProps) {
  const stacked = width > height
  const tall = height / width >= 1.5
  const step = stacked ? 0.86 : tall ? 1.08 : 1
  const em = (n: number) => `${(n * step).toFixed(2)}em`
  const pad = POSTER_PADDING[options.padding]

  const ink = tone === 'ink'
  const textColor = ink ? 'text-paper-fixed' : 'text-ink-fixed'
  const muted = ink ? 'text-paper-fixed/70' : 'text-ink-fixed/70'
  const faint = ink ? 'text-paper-fixed/45' : 'text-ink-fixed/45'
  const rule = ink ? 'border-paper-fixed/25' : 'border-ink-fixed/15'
  const hairline = ink ? 'bg-paper-fixed/25' : 'bg-ink-fixed/15'
  const wash = ink ? 'bg-ink-fixed/60' : 'bg-paper-fixed/60'

  const align = resolvePosterAlign(options.align, 'left')
  const columns = resolveFieldColumns(options.fieldColumns, 2)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const titleScale = clamp(options.titleScale, 0.8, 1.4)

  const cover =
    options.showCover && options.coverPlacement !== 'hidden' && data.cover ? image(data.cover) : ''
  const hasCover = cover !== ''
  const layout = resolveLayout(options.coverPlacement, stacked, hasCover)
  const row = layout === 'left' || layout === 'right'
  const title = data.title.trim()
  const subtitle = data.subtitle.trim()
  const initial = title.slice(0, 1)
  const signed = options.showSignature && options.signature.trim() !== ''
  const hasAliases = options.showAliases && data.aliases.some((alias) => alias.trim() !== '')

  const baseTitle = tall ? 2.9 : 2.7
  const titleSize = `${(baseTitle * titleScale).toFixed(2)}em`
  const sideWidth = `${40 * coverScale}%`
  const topHeight = `${Math.min(64, (stacked ? 34 : 40) * coverScale)}%`

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
      }}
    >
      {layout === 'background' ? (
        <>
          <PosterCover src={cover} options={options} className="absolute inset-0 h-full w-full" />
          <div className={`absolute inset-0 ${wash}`} />
        </>
      ) : null}

      <div
        className="relative flex h-full min-h-0 w-full"
        style={{ zIndex: 1, flexDirection: row ? 'row' : 'column' }}
      >
        {/* 图 / 图带：贴边出血，无圆角；没有图时是细线 + 大号首字，不留空栏 */}
        {layout !== 'background' ? (
          <div
            className={`relative shrink-0 overflow-hidden ${row ? 'h-full' : 'w-full'}`}
            style={row ? { width: sideWidth } : { height: topHeight }}
          >
            {hasCover ? (
              // 图贴边：纵向满高 / 横向通栏，框裁掉多出来的部分（取景由 PosterCover 管）
              <PosterCover src={cover} options={options} className="absolute inset-0 h-full w-full" />
            ) : (
              <>
                {row ? (
                  <span
                    className={`absolute w-px ${hairline}`}
                    style={
                      layout === 'right'
                        ? { left: 0, top: pad * 0.6, bottom: pad * 0.6 }
                        : { right: 0, top: pad * 0.6, bottom: pad * 0.6 }
                    }
                  />
                ) : (
                  <span className={`absolute inset-x-0 bottom-0 h-px ${hairline}`} />
                )}
                {initial !== '' ? (
                  <span
                    className={`absolute font-serif font-bold ${ink ? 'text-paper-fixed/25' : 'text-ink-fixed/25'}`}
                    style={
                      row
                        ? {
                            ...(layout === 'right' ? { right: pad * 0.55 } : { left: pad * 0.55 }),
                            bottom: pad * 0.35,
                            fontSize: em(10),
                            lineHeight: 0.86,
                          }
                        : {
                            left: pad,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: em(6.4),
                            lineHeight: 1,
                          }
                    }
                  >
                    {initial}
                  </span>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* 文字栏 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ padding: pad }}>
          <div className={`flex shrink-0 border-b pb-[0.5em] ${rule}`}>
            {data.kindLabel.trim() !== '' ? (
              <span className="truncate uppercase" style={{ fontSize: em(0.5), letterSpacing: '0.3em' }}>
                {data.kindLabel}
              </span>
            ) : null}
          </div>

          {title !== '' ? (
            <h1
              className="shrink-0 font-serif font-bold"
              style={{
                marginTop: em(0.85),
                fontSize: titleSize,
                lineHeight: 1.12,
                letterSpacing: '0.02em',
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
              style={{ marginTop: em(0.5), fontSize: em(0.8), letterSpacing: '0.16em', textAlign: align }}
            >
              {subtitle}
            </p>
          ) : null}

          {hasAliases ? (
            <div className="shrink-0" style={{ marginTop: em(0.3) }}>
              <PosterAliases aliases={data.aliases} tone={tone} align={align} />
            </div>
          ) : null}

          {/* 名称与正文流之间那条线 */}
          <div
            className="flex shrink-0"
            style={{
              marginTop: em(1.1),
              justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
            }}
          >
            <span
              className={`block ${ink ? 'bg-paper-fixed/35' : 'bg-ink-fixed/25'}`}
              style={{ width: em(2.4), height: 1 }}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ marginTop: em(1) }}>
            <PosterFlow
              data={data}
              options={options}
              tone={tone}
              image={image}
              variant="paper"
              align={align}
              columns={columns}
              gap={1}
              maxFields={8}
              bodyLines={row ? (tall ? 12 : 8) : 6}
            />
          </div>

          {signed ? (
            <div
              className={`flex shrink-0 items-baseline justify-between border-t ${rule}`}
              style={{ gap: em(1), marginTop: em(1.1), paddingTop: em(0.55), fontSize: em(0.48), letterSpacing: '0.3em' }}
            >
              <span className="truncate">{options.signature}</span>
              <span className={`shrink-0 truncate ${faint}`}>{data.templateName}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
