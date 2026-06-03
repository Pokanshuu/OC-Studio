import { heicTo } from 'heic-to'

const HEIF_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const HEIF_EXTENSIONS = new Set(['heic', 'heif', 'heics', 'heifs'])

/**
 * 检测 Blob/File 是否为 HEIF/HEIC 格式。
 * 双路径检测：MIME type + 文件名后缀（某些浏览器对 HEIF 返回空 MIME）。
 */
export function isHeif(file: Blob | File): boolean {
  const mime = file.type.toLowerCase()
  const ext = file instanceof File && file.name
    ? file.name.split('.').pop()?.toLowerCase()
    : undefined

  const isHeifMime = HEIF_MIME_TYPES.has(mime)
  const isHeifExt = ext ? HEIF_EXTENSIONS.has(ext) : false
  const result = isHeifMime || isHeifExt

  // DEBUG: 打印检测细节，排查 HEIF 黑屏问题
  console.debug(
    '[image-heif] isHeif 检测:',
    `MIME="${mime || '(空)'}"`,
    `ext="${ext || '(空)'}"`,
    `byMime=${isHeifMime}`,
    `byExt=${isHeifExt}`,
    `=> ${result ? 'HEIF ✓' : '非 HEIF 跳过'}`,
  )

  return result
}

/**
 * 将 HEIF/HEIC 图片转换为 JPEG。
 * 非 HEIF 文件直接透传，零开销。
 *
 * @param blob - 原始图片 blob（HEIF 或其他格式均可）
 * @param quality - JPEG 质量 0~1，默认 0.92
 * @returns JPEG blob（输入非 HEIF 则返回原始 blob）
 * @throws 转换失败时抛出 "HEIF 格式不支持" 错误
 */
export async function convertHeifToJpeg(
  blob: Blob,
  quality: number = 0.92,
): Promise<Blob> {
  if (!isHeif(blob)) {
    return blob
  }

  console.debug('[image-heif] 开始 HEIF → JPEG 转换，质量=', quality)

  try {
    const result = await heicTo({
      blob,
      type: 'image/jpeg',
      quality,
    })
    console.debug('[image-heif] HEIF → JPEG 转换成功，output size=', result.size, 'bytes')
    return result
  } catch (err) {
    console.error('[image-heif] HEIF → JPEG 转换失败:', err)
    throw new Error('HEIF 格式不支持')
  }
}
