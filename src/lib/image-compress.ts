/**
 * 编辑器粘贴/拖拽图片的预处理：最大边 1600px，小图不重编码。
 *
 * 与 Simple_Office 的 prepareImageFile 同一套判断（最长边 / 体积阈值 / PNG 透明通道），
 * 但 OC 的落盘是文件而不是 data URL，所以这里只产出 Blob，由 image-service 决定
 * 存进 vault 素材目录还是 appData。
 */

import { convertHeifToJpeg } from './image-heif'

const MAX_EDGE = 1600
const KEEP_BELOW_BYTES = 700 * 1024

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  originalBytes: number
  bytes: number
  mime: string
  compressed: boolean
}

function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    let settled = false
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), 8000)
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality)
  })
}

function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const stepX = Math.max(1, Math.floor(width / 120))
    const stepY = Math.max(1, Math.floor(height / 120))
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        if (ctx.getImageData(x, y, 1, 1).data[3] < 250) return true
      }
    }
  } catch {
    return false
  }
  return false
}

export async function compressImageFile(file: File, maxEdge = MAX_EDGE): Promise<CompressedImage> {
  const original: CompressedImage = {
    blob: file,
    width: 0,
    height: 0,
    originalBytes: file.size,
    bytes: file.size,
    mime: file.type,
    compressed: false,
  }

  // HEIC/HEIF 先转 JPEG，再走统一的缩放；GIF/SVG 保持原样（canvas 会丢动画/矢量）。
  const looksHeif = /^image\/(heic|heif)$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  if (looksHeif) {
    try {
      const converted = await convertHeifToJpeg(file)
      if (converted !== file) {
        const jpeg = new File([converted], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: converted.type || 'image/jpeg',
        })
        return compressImageFile(jpeg, maxEdge)
      }
    } catch {
      return original
    }
    return original
  }

  if (!/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) return original

  const image = await loadImage(file)
  if (!image) return original
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (width <= 0 || height <= 0) return original

  const sized = { ...original, width, height }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  if (scale >= 1 && file.size <= KEEP_BELOW_BYTES) return sized

  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return sized

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const wantsPng = file.type === 'image/png'
  const alpha = wantsPng ? hasAlpha(ctx, targetWidth, targetHeight) : false
  const mime = wantsPng && alpha ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, mime, 0.86)

  // 重编码反而更大时保留原图。
  if (!blob || blob.size >= file.size * 1.05) return sized

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    originalBytes: file.size,
    bytes: blob.size,
    mime,
    compressed: true,
  }
}
