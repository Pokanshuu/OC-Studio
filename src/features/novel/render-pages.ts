/**
 * 分页渲染（N2）：`NovelExportChapter[]` → 一页一张 canvas。
 *
 * 版式数字**全部来自 `pagination.ts`**（页尺寸 / 页边距 / 字号 / 行高 / 折行规则），
 * 所以「预览里看到的分页」与「导出的 PNG」是同一份分页，不会预览一套、导出另一套。
 * 背景走 `background.ts` 的唯一解（预设纹理 / 自定义图），与预览共用。
 *
 * 纯函数：输入章节与选项，输出画布数组，不读数据库、不写文件。
 * 唯一的外部依赖是浏览器 Canvas 与图片加载；因此这个模块在 Node 里可以安全
 * import（`planNovelPages` 就是给自检脚本用的），只有真正渲染时才要求 `document`。
 */
import type { NovelPageFormat, NovelPage } from './pagination'
import {
  PAGE_FONT_SIZE,
  PAGE_LINE_HEIGHT,
  PAGE_MARGIN,
  PAGE_SIZES,
  paginateNovel,
} from './pagination'
import {
  NOVEL_PAGE_INK,
  NOVEL_PAGE_NUMBER_INK,
  NOVEL_READING_PANEL,
  resolveNovelBackground,
  type NovelBackgroundKind,
  type NovelBackgroundResolution,
} from './background'

export interface NovelRenderBackground {
  kind: NovelBackgroundKind
  /** 自定义背景图：库内相对路径或 data URL */
  image?: string
}

export interface NovelRenderOptions {
  format: NovelPageFormat
  /** 清晰度：1 = 标清、1.5 = 高清、2 = 超清 */
  scale: number
  background?: NovelRenderBackground
  /** 每画完一页回调一次（导出对话框的进度文案用） */
  onProgress?: (done: number, total: number) => void
}

const FONT_FAMILY = "'Noto Serif SC', 'Songti SC', 'SimSun', serif"
const INK = NOVEL_PAGE_INK
const PAGE_NUMBER_INK = NOVEL_PAGE_NUMBER_INK

/** 分页结果（不画），给脚本与「大概几页」这类只读场景用 */
export function planNovelPages(
  chapters: Parameters<typeof paginateNovel>[0],
  format: NovelPageFormat,
): NovelPage[] {
  return paginateNovel(chapters, format)
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // 远程图必须走 CORS，否则画布被污染、`toBlob` 会直接抛
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function resolveBackgroundSource(src: string): Promise<string> {
  if (/^(data:|blob:|https?:)/i.test(src)) return src
  // 库内相对路径在桌面端要经 vault 解析；浏览器预览回落默认图
  const { resolveImageUrl } = await import('@/lib/image-service')
  return resolveImageUrl(src, 'header')
}

/** 铺满并居中裁切（自定义背景图） */
function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sw = width / scale
  const sh = height / scale
  const sx = (image.naturalWidth - sw) / 2
  const sy = (image.naturalHeight - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  background: NovelBackgroundResolution,
  image: HTMLImageElement | null,
): void {
  ctx.fillStyle = background.canvasFill
  ctx.fillRect(0, 0, size.width, size.height)
  if (image) drawCoverImage(ctx, image, size.width, size.height)
  background.texture?.(ctx, size.width, size.height)
  if (background.imageSrc) {
    // 自定义图可能很花：正文区垫一层纸色底板，保证字读得清
    ctx.fillStyle = NOVEL_READING_PANEL
    ctx.fillRect(
      PAGE_MARGIN * 0.55,
      PAGE_MARGIN * 0.45,
      size.width - PAGE_MARGIN * 1.1,
      size.height - PAGE_MARGIN * 0.9,
    )
  }
}

function wrapByMeasure(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    let line = ''
    for (const char of Array.from(paragraph)) {
      const candidate = line + char
      if (line.length > 0 && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = char
      } else {
        line = candidate
      }
    }
    if (line.length > 0) lines.push(line)
  }
  return lines
}

/** 章标题最多两行（`pagination.ts` 就是按两行预留的），超出用省略号收尾 */
function fitTitleLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrapByMeasure(ctx, text, maxWidth)
  if (lines.length <= maxLines) return lines.length > 0 ? lines : ['']
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1)
  }
  kept[maxLines - 1] = `${last}…`
  return kept
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  page: NovelPage,
  size: { width: number; height: number },
): void {
  const lineHeight = PAGE_FONT_SIZE * PAGE_LINE_HEIGHT
  const contentWidth = size.width - PAGE_MARGIN * 2
  let y = PAGE_MARGIN

  if (page.startsChapter) {
    const titleSize = Math.round(PAGE_FONT_SIZE * 1.45)
    ctx.fillStyle = INK
    ctx.font = `600 ${titleSize}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const titleLines = fitTitleLines(ctx, page.chapterTitle || '未命名章节', contentWidth, 2)
    let titleY = PAGE_MARGIN + 4
    for (const line of titleLines) {
      ctx.fillText(line, size.width / 2, titleY)
      titleY += lineHeight
    }
    // 分页时章标题固定占两行高度，这里必须让出同样的两行
    y = PAGE_MARGIN + lineHeight * 2
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(PAGE_MARGIN, y, contentWidth, Math.max(0, size.height - PAGE_MARGIN - y))
  ctx.clip()
  ctx.fillStyle = INK
  ctx.font = `${PAGE_FONT_SIZE}px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const line of page.lines) {
    if (line.length > 0) ctx.fillText(line, PAGE_MARGIN, y)
    y += lineHeight
  }
  ctx.restore()

  // 页码固定在右下角，不参与正文折行
  ctx.fillStyle = PAGE_NUMBER_INK
  ctx.font = `${Math.round(PAGE_FONT_SIZE * 0.7)}px ${FONT_FAMILY}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(page.index), size.width - PAGE_MARGIN, size.height - PAGE_MARGIN * 0.55)
}

/**
 * 章节 → 画布页。
 *
 * 画布物理尺寸 = 版心尺寸 × 清晰度；绘制时用 `setTransform` 把坐标统一回 CSS px，
 * 所以 1 / 1.5 / 2 三档只改分辨率，不改版式（行数、折行、页码位置完全一致）。
 */
export async function renderNovelPages(
  chapters: Parameters<typeof paginateNovel>[0],
  options: NovelRenderOptions,
): Promise<HTMLCanvasElement[]> {
  if (typeof document === 'undefined') {
    throw new Error('分页渲染只能在浏览器里运行')
  }
  const pages = paginateNovel(chapters, options.format)
  if (pages.length === 0) return []

  const size = PAGE_SIZES[options.format]
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1
  const background = resolveNovelBackground(
    options.background?.kind ?? 'paper',
    options.background?.image,
  )
  let backgroundImage: HTMLImageElement | null = null
  if (background.imageSrc) {
    const src = await resolveBackgroundSource(background.imageSrc)
    backgroundImage = await loadImage(src)
  }

  const canvases: HTMLCanvasElement[] = []
  for (const [index, page] of pages.entries()) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * scale))
    canvas.height = Math.max(1, Math.round(size.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paintBackground(ctx, size, background, backgroundImage)
    drawPage(ctx, page, size)
    canvases.push(canvas)
    if (options.onProgress) {
      options.onProgress(index + 1, pages.length)
      // 让出一帧，进度文案才会一页一页地变（否则整批同步画完才渲染一次）
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
  return canvases
}

/** 画布 → PNG 字节（ZIP 打包用；`toBlob` 不可用时退回 data URL） */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) return new Uint8Array(await blob.arrayBuffer())
  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
