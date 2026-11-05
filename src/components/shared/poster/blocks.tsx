'use client'

/**
 * 海报正文流的共享积木。
 *
 * 版式（六套）只决定「画布怎么分栏、封面放哪、标题怎么排」；正文里的
 * 基本信息 / 标签 / 简介 / 正文 / 关系 / 画廊 一律由这里渲染 —— 这样
 * **组件顺序、显隐、对齐、列数、字号** 在六套版式上行为一致，用户改一次全生效。
 *
 * 三种皮肤（`variant`）只改质感，不改结构：
 * - `paper`     杂志 / 极简：标签小字在上、值在下，两栏定义列表
 * - `archive`   档案：等宽 key/value 行，细线分隔
 * - `cinematic` 电影：横向小字条，label 与 value 同排
 *
 * 文字尺寸一律用 `em`，根字号由版式设成 `16 × fontScale`，所以「字号」滑杆
 * 对这里所有内容一起生效。
 */
import type { CSSProperties, ReactNode } from 'react'
import {
  enabledPosterBlocks,
  type PosterBlockId,
  type PosterData,
  type PosterOptions,
  type PosterTone,
} from '@/lib/export/poster/types'

export type PosterFlowVariant = 'paper' | 'archive' | 'cinematic'

export interface PosterFlowProps {
  data: PosterData
  options: PosterOptions
  tone: PosterTone
  image: (src: string) => string
  variant?: PosterFlowVariant
  /** 已解析的对齐（版式把 `auto` 解析成自己的默认值） */
  align: 'left' | 'center' | 'right'
  /** 基本信息列数（已解析） */
  columns: 1 | 2
  className?: string
  style?: CSSProperties
  /** 块之间的间距（em） */
  gap?: number
  maxFields?: number
  bodyLines?: number
}

const ALIGN_TEXT: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const ALIGN_ITEMS: Record<'left' | 'center' | 'right', string> = {
  left: 'items-start',
  center: 'items-center',
  right: 'items-end',
}

interface ToneClasses {
  strong: string
  body: string
  muted: string
  faint: string
  line: string
  soft: string
}

function toneClasses(tone: PosterTone): ToneClasses {
  return tone === 'ink'
    ? {
        strong: 'text-paper-fixed',
        body: 'text-paper-fixed/90',
        muted: 'text-paper-fixed/70',
        faint: 'text-paper-fixed/50',
        line: 'border-paper-fixed/20',
        soft: 'bg-paper-fixed/10',
      }
    : {
        strong: 'text-ink-fixed',
        body: 'text-ink-fixed/90',
        muted: 'text-ink-fixed/70',
        faint: 'text-ink-fixed/45',
        line: 'border-ink-fixed/15',
        soft: 'bg-ink-fixed/[0.06]',
      }
}

function clampStyle(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  }
}

/** 小标题：全大写 + 字距，像版面上的 section marker。 */

export function PosterFields({
  data,
  tone,
  align,
  columns,
  variant,
  maxFields = 8,
}: {
  data: PosterData
  tone: PosterTone
  align: 'left' | 'center' | 'right'
  columns: 1 | 2
  variant: PosterFlowVariant
  maxFields?: number
}) {
  const fields = data.fields.filter((field) => field.value.trim() !== '').slice(0, maxFields)
  if (fields.length === 0) return null
  const t = toneClasses(tone)
  const alignClass = ALIGN_TEXT[align]

  if (variant === 'archive') {
    return (
      <div className={`flex w-full flex-col ${t.line}`} style={{ borderTopWidth: 1 }}>
        {fields.map((field) => (
          <div
            key={field.label}
            className={`flex items-baseline gap-[1.5em] border-b py-[0.55em] ${t.line} ${alignClass}`}
          >
            <span
              className={`w-[5.5em] shrink-0 font-mono ${t.faint}`}
              style={{ fontSize: '0.68em', letterSpacing: '0.16em' }}
            >
              {field.label}
            </span>
            <span className={`min-w-0 flex-1 ${t.body}`} style={{ fontSize: '0.95em', lineHeight: 1.6 }}>
              {field.value}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'cinematic') {
    return (
      <div className={`flex w-full flex-wrap gap-x-[2.2em] gap-y-[0.7em] ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {fields.map((field) => (
          <div key={field.label} className={`flex flex-col ${align === 'center' ? 'items-center' : align === 'right' ? 'items-end' : 'items-start'}`}>
            <span className={t.faint} style={{ fontSize: '0.58em', letterSpacing: '0.22em' }}>
              {field.label}
            </span>
            <span className={`${t.strong} mt-[0.25em]`} style={{ fontSize: '0.94em', lineHeight: 1.5 }}>
              {field.value}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        columnGap: '2.4em',
        rowGap: '0.9em',
      }}
    >
      {fields.map((field) => (
        <div
          key={field.label}
          className={`flex flex-col gap-[0.18em] border-b pb-[0.5em] ${t.line} ${align === 'right' ? 'items-end text-right' : align === 'center' ? 'items-center text-center' : 'items-start'}`}
        >
          <span className={t.faint} style={{ fontSize: '0.66em', letterSpacing: '0.2em' }}>
            {field.label}
          </span>
          <span className={t.body} style={{ fontSize: '1.02em', lineHeight: 1.55 }}>
            {field.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PosterTags({ data, tone, variant }: { data: PosterData; tone: PosterTone; variant: PosterFlowVariant }) {
  const tags = data.tags.filter((tag) => tag.trim() !== '')
  if (tags.length === 0) return null
  const t = toneClasses(tone)

  if (variant === 'cinematic') {
    return (
      <div className={`flex flex-wrap items-center gap-x-[0.9em] gap-y-[0.4em] ${t.muted}`} style={{ fontSize: '0.72em', letterSpacing: '0.12em' }}>
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    )
  }

  if (variant === 'archive') {
    return (
      <div className={`flex flex-wrap gap-[0.5em] font-mono ${t.muted}`} style={{ fontSize: '0.7em', letterSpacing: '0.1em' }}>
        {tags.map((tag) => (
          <span key={tag}>[{tag}]</span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-[0.5em]">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`border px-[0.7em] py-[0.18em] ${t.line} ${t.muted}`}
          style={{ fontSize: '0.7em', letterSpacing: '0.06em' }}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function PosterRelations({
  data,
  tone,
  align,
}: {
  data: PosterData
  tone: PosterTone
  align: 'left' | 'center' | 'right'
}) {
  const relations = data.relations.filter((relation) => relation.label.trim() !== '').slice(0, 6)
  if (relations.length === 0) return null
  const t = toneClasses(tone)
  return (
    <div className="flex w-full flex-col gap-[0.45em]">
      {relations.map((relation, index) => (
        <div
          key={`${relation.label}-${index}`}
          className={`flex items-baseline gap-[0.8em] ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}
        >
          <span className={t.body} style={{ fontSize: '0.88em', lineHeight: 1.5 }}>
            {relation.label}
          </span>
          {relation.value ? (
            <span className={t.faint} style={{ fontSize: '0.7em', letterSpacing: '0.1em' }}>
              {relation.value}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function PosterGallery({
  data,
  image,
  variant,
}: {
  data: PosterData
  image: (src: string) => string
  variant: PosterFlowVariant
}) {
  const images = data.gallery.filter((src) => src !== '').slice(0, variant === 'cinematic' ? 3 : 4)
  if (images.length === 0) return null
  const columns = variant === 'cinematic' ? 3 : 2
  return (
    <div
      className="grid w-full gap-[0.35em]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {images.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- 导出时按真实图片路径取图
        <img
          key={`${src}-${index}`}
          src={image(src)}
          alt=""
          style={{ aspectRatio: '1 / 1', objectFit: 'cover', width: '100%' }}
        />
      ))}
    </div>
  )
}

export function PosterSummary({ data, tone, align }: { data: PosterData; tone: PosterTone; align: 'left' | 'center' | 'right' }) {
  if (data.summary.trim() === '') return null
  const t = toneClasses(tone)
  return (
    <p
      className={`w-full ${t.body}`}
      style={{ fontSize: '1.02em', lineHeight: 1.8, textAlign: align, ...clampStyle(4) }}
    >
      {data.summary}
    </p>
  )
}

export function PosterBody({
  data,
  tone,
  align,
  lines = 10,
}: {
  data: PosterData
  tone: PosterTone
  align: 'left' | 'center' | 'right'
  lines?: number
}) {
  if (data.body.trim() === '') return null
  const t = toneClasses(tone)
  return (
    <p
      className={`w-full whitespace-pre-line ${t.body}`}
      style={{ fontSize: '0.94em', lineHeight: 1.85, textAlign: align, ...clampStyle(lines) }}
    >
      {data.body}
    </p>
  )
}

export function PosterMetaLine({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: PosterTone
}) {
  if (value.trim() === '') return null
  const t = toneClasses(tone)
  return (
    <div className="flex items-baseline gap-[0.7em]">
      <span className={t.faint} style={{ fontSize: '0.64em', letterSpacing: '0.18em' }}>
        {label}
      </span>
      <span className={t.body} style={{ fontSize: '0.86em', lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  )
}

/**
 * 正文流：按 `options.blockOrder` 渲染所有启用的块。
 * 没有内容时返回 null —— 版式因此不需要给空块留位。
 */
export function PosterFlow({
  data,
  options,
  tone,
  image,
  variant = 'paper',
  align,
  columns,
  className = '',
  style,
  gap = 1.35,
  maxFields = 8,
  bodyLines = 10,
}: PosterFlowProps) {
  const blocks = enabledPosterBlocks(options)
  const items: ReactNode[] = []

  for (const block of blocks) {
    switch (block) {
      case 'fields':
        items.push(<PosterFields key={block} data={data} tone={tone} align={align} columns={columns} variant={variant} maxFields={maxFields} />)
        break
      case 'tags':
        items.push(<PosterTags key={block} data={data} tone={tone} variant={variant} />)
        break
      case 'time':
        items.push(<PosterMetaLine key={block} label="时间" value={data.time} tone={tone} />)
        break
      case 'location':
        items.push(<PosterMetaLine key={block} label="地点" value={data.location} tone={tone} />)
        break
      case 'summary':
        items.push(<PosterSummary key={block} data={data} tone={tone} align={align} />)
        break
      case 'body':
        items.push(<PosterBody key={block} data={data} tone={tone} align={align} lines={bodyLines} />)
        break
      case 'relations':
        items.push(<PosterRelations key={block} data={data} tone={tone} align={align} />)
        break
      case 'gallery':
        items.push(<PosterGallery key={block} data={data} image={image} variant={variant} />)
        break
      default:
        break
    }
  }

  const visible = items.filter(Boolean)
  if (visible.length === 0) return null

  return (
    <div
      className={`flex w-full flex-col ${ALIGN_ITEMS[align]} ${className}`}
      style={{ gap: `${gap}em`, ...style }}
    >
      {visible}
    </div>
  )
}

/** 版式里「正文流之外」的固定块（标题 / 别名）也用同一套字号语言。 */
export function PosterAliases({ aliases, tone, align }: { aliases: string[]; tone: PosterTone; align: 'left' | 'center' | 'right' }) {
  const list = aliases.filter((alias) => alias.trim() !== '')
  if (list.length === 0) return null
  const t = toneClasses(tone)
  return (
    <p className={`${t.muted} ${ALIGN_TEXT[align]}`} style={{ fontSize: '0.82em', lineHeight: 1.6 }}>
      {list.join(' · ')}
    </p>
  )
}

export { toneClasses as posterToneClasses, ALIGN_TEXT as POSTER_ALIGN_TEXT }

export type { PosterBlockId }
