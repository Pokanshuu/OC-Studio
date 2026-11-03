/**
 * 生成地图卡片缩略图。仅在主线程使用，输入来自 Worker 的 ImageData。
 */
export async function makeMapBlob(image: ImageData): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.putImageData(image, 0, 0)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null
  }
}

export function makeMapThumbnail(image: ImageData, width = 320): string | null {
  if (typeof document === 'undefined') return null
  try {
    const height = Math.max(1, Math.round((image.height / image.width) * width))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    const source = document.createElement('canvas')
    source.width = image.width
    source.height = image.height
    const sourceContext = source.getContext('2d')
    if (!sourceContext) return null
    sourceContext.putImageData(image, 0, 0)
    context.drawImage(source, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}
