/**
 * 封面卡的图片加载与缓存。
 *
 * 三条经验：
 * 1. 先带 `crossOrigin="anonymous"` 取 —— Tauri 的 asset 协议会回
 *    `Access-Control-Allow-Origin: <窗口 origin>`，于是画布**不被污染**，
 *    逐行模糊与自动取色都能跑。
 * 2. 失败（外部图床没给 CORS）再不带 crossOrigin 重试一次：图照样能画，
 *    只是读不到像素，走 `paintSoftDissolve` 的降级。
 * 3. 每张图探一次 `readable`（1×1 画布读一个像素），结果跟着缓存走，
 *    免得每次渲染都抛一次 SecurityError。
 */

import type { CoverImage } from './scene'

const CACHE_LIMIT = 24

/**
 * 解码后的位图有一半是浪费的：卡片画布最宽 760px，素材再大也只会被缩小。
 * 落在 1024px 上，既能保住 2× 屏的清晰度，又把每张图的内存从几十 MB 降到几 MB。
 */
const MAX_SOURCE_SIDE = 1024

const cache = new Map<string, Promise<CoverImage | null>>()

function loadElement(src: string, anonymous: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    if (anonymous) image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** 缩到最大边以内；本来就够小就原样返回 */
function shrink(image: HTMLImageElement): HTMLCanvasElement | null {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(width, height))
  if (scale >= 1) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** 画一个像素试试能不能读 —— 读得到就说明这张图没有污染画布 */
function probeReadable(source: CanvasImageSource): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(source, 0, 0, 1, 1)
    ctx.getImageData(0, 0, 1, 1)
    return true
  } catch {
    return false
  }
}

async function create(src: string): Promise<CoverImage | null> {
  const image = (await loadElement(src, true)) ?? (await loadElement(src, false))
  if (!image) return null
  try {
    if (typeof image.decode === 'function') await image.decode()
  } catch {
    // decode 失败不致命：onload 已经拿到可用的位图
  }
  // 先探原始图（跨域判定与缩放无关），再缩到卡片够用的尺寸
  const readable = probeReadable(image)
  const scaled = shrink(image)
  return {
    element: scaled ?? image,
    width: scaled?.width ?? (image.naturalWidth || image.width),
    height: scaled?.height ?? (image.naturalHeight || image.height),
    readable,
  }
}

export function loadCoverImage(src: string): Promise<CoverImage | null> {
  const hit = cache.get(src)
  if (hit) return hit

  const pending = create(src)
  cache.set(src, pending)

  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  return pending
}
