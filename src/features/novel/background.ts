'use client'

/**
 * Original, simplified parchment frame used for novel page previews and exports.
 * It is intentionally drawn from primitives rather than copied from any image.
 */
export function createNovelBackgroundSvg(width: number, height: number): string {
  const w = Math.max(320, Math.round(width))
  const h = Math.max(320, Math.round(height))
  const unit = Math.min(w, h)
  const inset = unit * 0.035
  const inner = unit * 0.055
  const stroke = Math.max(1, unit * 0.0022)
  const gold = '#b89a67'
  const deepGold = '#9a7a4c'
  const corner = unit * 0.13

  const flourish = (x: number, y: number, sx: number, sy: number): string => `
    <g transform="translate(${x} ${y}) scale(${sx} ${sy})">
      <path d="M0 ${corner * 0.72}
        C0 ${corner * 0.3}, ${corner * 0.28} 0, ${corner * 0.72} 0"
        fill="none" stroke="${deepGold}" stroke-width="${stroke * 1.5}" stroke-linecap="round"/>
      <path d="M${corner * 0.1} ${corner * 0.6}
        C${corner * 0.08} ${corner * 0.26}, ${corner * 0.38} ${corner * 0.15}, ${corner * 0.58} ${corner * 0.23}
        C${corner * 0.78} ${corner * 0.31}, ${corner * 0.72} ${corner * 0.55}, ${corner * 0.52} ${corner * 0.56}"
        fill="none" stroke="${gold}" stroke-width="${stroke}" stroke-linecap="round"/>
      <path d="M${corner * 0.23} ${corner * 0.58}
        C${corner * 0.34} ${corner * 0.44}, ${corner * 0.53} ${corner * 0.44}, ${corner * 0.6} ${corner * 0.6}"
        fill="none" stroke="${deepGold}" stroke-width="${stroke * 0.8}" stroke-linecap="round"/>
      <path d="M${corner * 0.38} ${corner * 0.62}
        C${corner * 0.42} ${corner * 0.52}, ${corner * 0.5} ${corner * 0.52}, ${corner * 0.54} ${corner * 0.6}"
        fill="none" stroke="${gold}" stroke-width="${stroke * 0.7}" stroke-linecap="round"/>
      <circle cx="${corner * 0.55}" cy="${corner * 0.185}" r="${stroke * 1.6}" fill="${deepGold}"/>
      <circle cx="${corner * 0.185}" cy="${corner * 0.55}" r="${stroke * 1.6}" fill="${deepGold}"/>
      <path d="M${corner * 0.68} ${corner * 0.08} C${corner * 0.9} ${corner * 0.02}, ${corner * 0.98} ${corner * 0.12}, ${corner * 0.9} ${corner * 0.2}"
        fill="none" stroke="${deepGold}" stroke-width="${stroke * 0.65}" stroke-linecap="round"/>
    </g>`

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="parchment" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f2e6ce"/>
        <stop offset="0.48" stop-color="#e9d8b7"/>
        <stop offset="1" stop-color="#ddc59d"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.42" r="0.72">
        <stop offset="0" stop-color="#fff9ec" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#c7aa78" stop-opacity="0.08"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(0.4, unit * 0.0008)}"/></filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#parchment)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}"
      fill="none" stroke="${gold}" stroke-width="${stroke * 1.8}" opacity="0.9"/>
    <rect x="${inset + inner}" y="${inset + inner}" width="${w - (inset + inner) * 2}" height="${h - (inset + inner) * 2}"
      fill="none" stroke="${deepGold}" stroke-width="${stroke * 0.7}" opacity="0.72"/>
    <path d="M${w * 0.34} ${inset} H${w * 0.66}" stroke="${deepGold}" stroke-width="${stroke}" opacity="0.55"/>
    <path d="M${w * 0.34} ${h - inset} H${w * 0.66}" stroke="${deepGold}" stroke-width="${stroke}" opacity="0.55"/>
    ${flourish(inset + inner * 0.7, inset + inner * 0.7, 1, 1)}
    ${flourish(w - inset - inner * 0.7, inset + inner * 0.7, -1, 1)}
    ${flourish(inset + inner * 0.7, h - inset - inner * 0.7, 1, -1)}
    ${flourish(w - inset - inner * 0.7, h - inset - inner * 0.7, -1, -1)}
    <g opacity="0.65" fill="${deepGold}">
      <circle cx="${w * 0.5}" cy="${h * 0.055}" r="${stroke * 1.3}"/>
      <circle cx="${w * 0.5}" cy="${h - h * 0.055}" r="${stroke * 1.3}"/>
    </g>
  </svg>`
}

export function novelBackgroundDataUrl(width: number, height: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createNovelBackgroundSvg(width, height))}`
}

export interface NovelPageDimensions {
  width: number
  height: number
}

export function getNovelPageDimensions(
  format: '9:16' | '16:9' | 'A4',
  scale: number,
): NovelPageDimensions {
  const base =
    format === '16:9'
      ? { width: 1600, height: 900 }
      : format === 'A4'
        ? { width: 900, height: 1273 }
        : { width: 1080, height: 1920 }
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  }
}
