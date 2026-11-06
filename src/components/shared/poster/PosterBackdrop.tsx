'use client'

/**
 * 背景层。所有版式共用：版式只负责前景排版，纸色 / 墨色 / 网格 / 渐变 /
 * 封面模糊这些「底」由这里统一画，避免六套版式各写一遍。
 *
 * 封面模糊照搬 Simple_Cover 的思路（见 `docs/封面卡.md` §1）：把封面图放大、
 * 模糊、再压一层纸色 / 墨色 wash，保证前景文字永远读得清。这里用 CSS blur，
 * 不上 Canvas —— 海报是 DOM 截图（`html-to-image`），CSS 滤镜会被一起栅格化。
 */
import type { PosterBackground, PosterData, PosterTone } from '@/lib/export/poster/types'

export function PosterBackdrop({
  background,
  data,
  image,
  tone,
}: {
  background: PosterBackground
  data: PosterData
  image: (src: string) => string
  tone: PosterTone
}) {
  if (background === 'transparent') return null

  if (background === 'ink') {
    return <div className="absolute inset-0 bg-ink-fixed" aria-hidden />
  }

  if (background === 'grid') {
    return (
      <div
        className="absolute inset-0 bg-paper-fixed"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--oc-ink-fixed) 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--oc-ink-fixed) 14%, transparent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
    )
  }

  if (background === 'gradient') {
    return (
      <div
        className="absolute inset-0 bg-paper-fixed"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(120% 90% at 12% 0%, color-mix(in srgb, var(--oc-ink-fixed) 9%, transparent) 0%, transparent 58%), radial-gradient(90% 80% at 92% 108%, color-mix(in srgb, var(--oc-ink-fixed) 7%, transparent) 0%, transparent 55%)',
        }}
      />
    )
  }

  if (background === 'cover') {
    return (
      <div className="absolute inset-0 overflow-hidden bg-paper-fixed" aria-hidden>
        {data.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 导出时按真实图片路径取图
          <img
            src={image(data.cover)}
            alt=""
            style={{
              position: 'absolute',
              inset: '-8%',
              width: '116%',
              height: '116%',
              objectFit: 'cover',
              filter: 'blur(42px) saturate(1.15)',
              transform: 'scale(1.06)',
              opacity: tone === 'ink' ? 0.5 : 0.64,
            }}
          />
        ) : null}
        <div className={`absolute inset-0 ${tone === 'ink' ? 'bg-ink-fixed/70' : 'bg-paper-fixed/82'}`} />
      </div>
    )
  }

  return <div className="absolute inset-0 bg-paper-fixed" aria-hidden />
}
