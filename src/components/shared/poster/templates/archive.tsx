'use client'

/**
 * 档案 / archive —— 设定集档案页：档案头 + 证件照 + 等宽 key/value 表 + 签名线。
 *
 * 编号从 `kindLabel` 派生，认不出的种类退回 `DOSSIER`；照片默认贴左，
 * 用户的 `coverPlacement` 可把它挪到顶部 / 右侧 / 隐藏。
 *
 * 正文块统一交给 `PosterFlow`（`variant="archive"`），顺序 / 显隐 / 对齐 / 字号由共享积木决定。
 * 文字尺寸一律 `em`（根节点 `16 × fontScale`），标题字号再乘 `titleScale`。
 */
import type { PosterCoverPlacement, PosterTone, PosterTemplateProps } from '@/lib/export/poster/types'
import { POSTER_BASE_FONT_SIZE, POSTER_PADDING, resolveFieldColumns, resolvePosterAlign } from '@/lib/export/poster/types'
import { POSTER_ALIGN_TEXT, PosterAliases, PosterFlow } from '@/components/shared/poster/blocks'
import { PosterCover } from '../PosterCover'

export const posterMeta = { name: '档案', hint: '设定集档案' }

type Placement = 'top' | 'left' | 'right' | 'hidden'

interface Palette {
  text: string
  muted: string
  faint: string
  line: string
  well: string
}

function paletteFor(tone: PosterTone): Palette {
  if (tone === 'paper') {
    return {
      text: 'text-ink-fixed',
      muted: 'text-ink-fixed/70',
      faint: 'text-ink-fixed/45',
      line: 'border-ink-fixed/15',
      well: 'bg-ink-fixed/[0.06]',
    }
  }
  return {
    text: 'text-paper-fixed',
    muted: 'text-paper-fixed/70',
    faint: 'text-paper-fixed/45',
    line: 'border-paper-fixed/25',
    well: 'bg-paper-fixed/10',
  }
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function serialFor(kindLabel: string): string {
  if (kindLabel.includes('角色')) return 'NO. 001'
  if (kindLabel.includes('事件')) return 'NO. 002'
  if (kindLabel.includes('国家')) return 'NO. 003'
  if (kindLabel.includes('词条')) return 'NO. 004'
  return 'DOSSIER'
}

function resolvePlacement(placement: PosterCoverPlacement): Placement {
  if (placement === 'top' || placement === 'left' || placement === 'right' || placement === 'hidden') {
    return placement
  }
  // `background` 在这里退化成「顶部横幅」，是方块版式里最接近的一档
  return placement === 'background' ? 'top' : 'left'
}

export default function ArchivePoster({ data, options, width, height, tone, image }: PosterTemplateProps) {
  const palette = paletteFor(tone)
  const pad = POSTER_PADDING[options.padding]
  const wide = options.ratio === 'wide'
  const portrait = options.ratio === 'portrait'
  const square = options.ratio === 'square'

  const align = resolvePosterAlign(options.align, 'left')
  const alignText = POSTER_ALIGN_TEXT[align]
  const columns = resolveFieldColumns(options.fieldColumns, 1)
  const titleScale = clamp(options.titleScale, 0.8, 1.4)
  const coverScale = clamp(options.coverScale, 0.7, 1.3)
  const placement = resolvePlacement(options.coverPlacement)

  const coverSrc = options.showCover && data.cover ? image(data.cover) : ''
  const hasCover = coverSrc !== '' && placement !== 'hidden'

  const titleSize = `${((portrait ? 2.6 : wide ? 1.9 : 2.2) * titleScale).toFixed(2)}em`
  const bodyLines = wide ? 6 : square ? 6 : portrait ? 10 : 8

  const sideWidth = percent(clamp((wide ? 0.2 : 0.34) * coverScale, 0.14, 0.56))
  const topHeight = percent(clamp((wide ? 0.42 : 0.3) * coverScale, 0.18, 0.55))

  const coverImage = (className: string) => (
    <PosterCover src={coverSrc} options={options} className={className} />
  )

  const header = (
    <header className="shrink-0">
      <div className="flex items-baseline justify-between gap-[1em]">
        <span className={`font-mono uppercase tracking-[0.24em] ${palette.text}`} style={{ fontSize: '0.62em' }}>
          {data.serial ?? serialFor(data.kindLabel)}
        </span>
        <span
          className={`truncate font-mono uppercase tracking-[0.18em] ${palette.muted}`}
          style={{ fontSize: '0.58em' }}
        >
          {[data.kindLabel.trim() !== '' ? data.kindLabel : 'DOSSIER', data.templateName]
            .filter((part) => part !== '')
            .join('  /  ')}
        </span>
      </div>
      <div className={`mt-[0.75em] border-b ${palette.line}`} />
    </header>
  )

  const sidePhoto = (
    <div
      className={`relative shrink-0 self-start overflow-hidden rounded-item border ${palette.line} ${palette.well}`}
      style={{ width: sideWidth, aspectRatio: '1 / 1' }}
    >
      {coverImage('absolute inset-0 h-full w-full')}
    </div>
  )

  const topPhoto = (
    <div
      className={`relative w-full shrink-0 overflow-hidden rounded-item border ${palette.line} ${palette.well}`}
      style={{ height: topHeight }}
    >
      {coverImage('absolute inset-0 h-full w-full')}
    </div>
  )

  const title =
    data.title.trim() !== '' ? (
      <h1
        className={`font-serif font-bold leading-[1.08] tracking-[-0.01em] [overflow-wrap:anywhere] ${alignText}`}
        style={{ fontSize: titleSize }}
      >
        {data.title}
      </h1>
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
      variant="archive"
      align={align}
      columns={columns}
      gap={1.05}
      maxFields={8}
      bodyLines={bodyLines}
    />
  )

  const signatureBar =
    options.showSignature && options.signature.trim() !== '' ? (
      <footer
        className={`mt-[0.9em] flex shrink-0 items-baseline justify-between gap-[1em] border-t pt-[0.55em] ${palette.line}`}
        style={{ fontSize: '0.58em' }}
      >
        <span className={`font-mono uppercase tracking-[0.26em] ${palette.muted}`}>{options.signature}</span>
        <span className={`truncate font-mono uppercase tracking-[0.18em] ${palette.faint}`}>
          {data.templateName}  /  ARCHIVE
        </span>
      </footer>
    ) : null

  return (
    <div
      className={`relative flex flex-col overflow-hidden ${palette.text}`}
      style={{ width, height, padding: pad, fontSize: POSTER_BASE_FONT_SIZE * options.fontScale, boxSizing: 'border-box' }}
    >
      {header}

      <div className="mt-[1.2em] flex min-h-0 flex-1 flex-col">
        {hasCover && placement === 'top' ? topPhoto : null}

        <div className={`flex shrink-0 items-start gap-[1.8em] ${hasCover && placement === 'top' ? 'mt-[1em]' : ''}`}>
          {hasCover && placement === 'left' ? sidePhoto : null}
          <div className="min-w-0 flex-1">
            {title}
            {aliasLine}
          </div>
          {hasCover && placement === 'right' ? sidePhoto : null}
        </div>

        <div className="relative mt-[1em] min-h-0 flex-1 overflow-hidden">
          {flow}
          {/* 档案水印：内容短时把下半页接住，不铺一块空白色块 */}
          <div
            aria-hidden
            className={`pointer-events-none absolute bottom-0 right-0 select-none font-mono uppercase ${palette.faint}`}
            style={{ fontSize: '3.6em', lineHeight: 1, letterSpacing: '0.08em', opacity: 0.06 }}
          >
            {data.serial ?? serialFor(data.kindLabel)}
          </div>
        </div>
      </div>

      {signatureBar}
    </div>
  )
}
