/**
 * 分页渲染（N2）：`NovelExportChapter[]` → 一页一张 canvas。
 *
 * 版式数字**全部来自 `pagination.ts`（分页）+ `layout.ts`（版式）**，
 * 所以「预览里看到的那一页」与「导出的 PNG」是同一份行、同一组坐标 —— 不会预览一套、导出另一套。
 * 背景走 `background.ts` 的唯一解（预设纹理 / 自定义图），与预览共用。
 *
 * 纯函数：输入章节与选项，输出画布数组，不读数据库、不写文件。
 * 唯一的外部依赖是浏览器 Canvas 与图片加载；因此这个模块在 Node 里可以安全
 * import（`planNovelPages` 就是给自检脚本用的），只有真正渲染时才要求 `document`。
 */
import type { NovelBookMeta, NovelLayoutOverrides, NovelPage, NovelPageFormat, NovelRow } from './pagination'
import { PAGE_SIZES, TITLE_LINES, paginateNovel, resolvePageLayout } from './pagination'
import type { NovelLayoutParams } from './layout'
import { DEFAULT_NOVEL_LAYOUT, NOVEL_FONTS, normalizeNovelLayout, titleFontSize, titlePageFontSize } from './layout'
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
  /** 版式（字体 / 字号 / 行距 / 页边距 / 页码…）；不传就是默认「书页」 */
  layout?: Partial<NovelLayoutParams>
  /** 作品信息：扉页与副标题用 */
  meta?: NovelBookMeta
  background?: NovelRenderBackground
  /** 每画完一页回调一次（导出对话框的进度文案用） */
  onProgress?: (done: number, total: number) => void
}

const INK = NOVEL_PAGE_INK
const PAGE_NUMBER_INK = NOVEL_PAGE_NUMBER_INK

/** 分页结果（不画），给脚本与「大概几页」这类只读场景用 */
export function planNovelPages(
  chapters: Parameters<typeof paginateNovel>[0],
  input?: NovelPageFormat | NovelLayoutOverrides,
): NovelPage[] {
  return paginateNovel(chapters, input)
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
  margin: number,
): void {
  ctx.fillStyle = background.canvasFill
  ctx.fillRect(0, 0, size.width, size.height)
  if (image) drawCoverImage(ctx, image, size.width, size.height)
  background.texture?.(ctx, size.width, size.height)
  if (background.imageSrc) {
    // 自定义图可能很花：正文区垫一层纸色底板，保证字读得清
    const inset = Math.min(margin * 0.55, 32)
    ctx.fillStyle = NOVEL_READING_PANEL
    ctx.fillRect(
      inset,
      Math.min(margin * 0.45, 26),
      size.width - inset * 2,
      size.height - Math.min(margin * 0.45, 26) * 2,
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

/** 章标题最多两行（分页就是按两行预留的），超出用省略号收尾 */
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

/** 章首标题：三种样子，占位固定 `TITLE_LINES` 行 */
function drawChapterTitle(
  ctx: CanvasRenderingContext2D,
  layout: NovelLayoutParams,
  size: { width: number; height: number },
  text: string,
  top: number,
  linePx: number,
): void {
  const fontSize = titleFontSize(layout)
  const font = NOVEL_FONTS[layout.font].stack
  ctx.fillStyle = INK
  ctx.font = `600 ${fontSize}px ${font}`
  ctx.textBaseline = 'top'
  const contentWidth = size.width - layout.margin * 2
  const lines = fitTitleLines(ctx, text, contentWidth, TITLE_LINES)

  if (layout.titleStyle === 'center') {
    ctx.textAlign = 'center'
    let y = top + Math.max(0, (linePx * TITLE_LINES - lines.length * fontSize * 1.3) / 2)
    for (const line of lines) {
      ctx.fillText(line, size.width / 2, y)
      y += fontSize * 1.3
    }
    return
  }

  ctx.textAlign = 'left'
  let y = top + Math.max(0, (linePx * TITLE_LINES - lines.length * fontSize * 1.3) / 2)
  for (const line of lines) {
    ctx.fillText(line, layout.margin, y)
    y += fontSize * 1.3
  }
}

function drawTitlePage(
  ctx: CanvasRenderingContext2D,
  layout: NovelLayoutParams,
  size: { width: number; height: number },
  meta: NovelBookMeta,
): void {
  const font = NOVEL_FONTS[layout.font].stack
  const sizes = titlePageFontSize(layout)
  const contentWidth = size.width - layout.margin * 2 - 24
  const title = (meta.title ?? '').trim()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  // 书名：最多三行，垂直位置固定在三成高处（章节长短不影响扉页观感）
  ctx.font = `600 ${sizes.title}px ${font}`
  ctx.fillStyle = INK
  const titleLines = fitTitleLines(ctx, title || '未命名', contentWidth, 3)
  let y = size.height * 0.3
  for (const line of titleLines) {
    ctx.fillText(line, size.width / 2, y)
    y += sizes.title * 1.4
  }

  const author = (meta.author ?? '').trim()
  if (author) {
    ctx.font = `${sizes.author}px ${font}`
    ctx.fillStyle = PAGE_NUMBER_INK
    ctx.fillText(author.slice(0, 40), size.width / 2, y + sizes.title * 0.5)
  }

  const synopsis = (meta.synopsis ?? '').trim()
  if (synopsis) {
    ctx.font = `${sizes.synopsis}px ${font}`
    ctx.fillStyle = PAGE_NUMBER_INK
    const body = wrapByMeasure(ctx, synopsis, contentWidth - 32).slice(0, 8)
    let synopsisY = size.height * 0.56
    for (const line of body) {
      ctx.fillText(line, size.width / 2, synopsisY)
      synopsisY += sizes.synopsis * 1.9
    }
  }

  ctx.restore()
}

function drawPageNumber(
  ctx: CanvasRenderingContext2D,
  layout: NovelLayoutParams,
  size: { width: number; height: number },
  index: number,
): void {
  if (layout.pageNumber === 'none') return
  const font = NOVEL_FONTS[layout.font].stack
  ctx.fillStyle = PAGE_NUMBER_INK
  ctx.font = `${Math.round(layout.fontSize * 0.7)}px ${font}`
  ctx.textBaseline = 'middle'
  if (layout.pageNumber === 'center') {
    ctx.textAlign = 'center'
    ctx.fillText(String(index), size.width / 2, size.height - layout.margin * 0.55)
    return
  }
  ctx.textAlign = 'right'
  ctx.fillText(String(index), size.width - layout.margin, size.height - layout.margin * 0.55)
}

function drawRow(
  ctx: CanvasRenderingContext2D,
  layout: NovelLayoutParams,
  size: { width: number; height: number },
  row: NovelRow,
  y: number,
  linePx: number,
): number {
  if (row.kind === 'gap') return y + linePx
  if (row.kind === 'title') {
    drawChapterTitle(ctx, layout, size, row.text, y, linePx)
    return y + linePx * TITLE_LINES
  }
  if (row.text.length > 0) {
    ctx.fillStyle = INK
    ctx.font = `${layout.fontSize}px ${NOVEL_FONTS[layout.font].stack}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(row.text, layout.margin, y)
  }
  return y + linePx
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  page: NovelPage,
  layout: NovelLayoutParams,
  size: { width: number; height: number },
  meta: NovelBookMeta,
): void {
  if (page.titlePage) {
    drawTitlePage(ctx, layout, size, meta)
    return
  }

  const linePx = layout.fontSize * layout.lineHeight
  const contentWidth = size.width - layout.margin * 2
  let y = layout.margin

  ctx.save()
  ctx.beginPath()
  ctx.rect(layout.margin, y, contentWidth, Math.max(0, size.height - layout.margin * 2))
  ctx.clip()
  for (const row of page.rows) {
    // 行高按行累加：画完一页也不越过版心（分页已经算过容量，这里只是兜底）
    if (y > size.height - layout.margin) break
    y = drawRow(ctx, layout, size, row, y, linePx)
  }
  ctx.restore()

  drawPageNumber(ctx, layout, size, page.index)
}

/**
 * 章节 → 画布页。
 *
 * 画布物理尺寸 = 纸张尺寸 × 清晰度；绘制时用 `setTransform` 把坐标统一回 CSS px，
 * 所以 1 / 1.5 / 2 三档只改分辨率，不改版式（行数、折行、页码位置完全一致）。
 */
export async function renderNovelPages(
  chapters: Parameters<typeof paginateNovel>[0],
  options: NovelRenderOptions,
): Promise<HTMLCanvasElement[]> {
  if (typeof document === 'undefined') {
    throw new Error('分页渲染只能在浏览器里运行')
  }
  const layout = normalizeNovelLayout(options.layout ?? DEFAULT_NOVEL_LAYOUT)
  const layoutForPages = resolvePageLayout({
    format: options.format,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    margin: layout.margin,
    chapterBreak: layout.chapterBreak,
    titlePage: layout.titlePage,
    meta: options.meta,
  })
  const pages = paginateNovel(chapters, layoutForPages)
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

  const meta = options.meta ?? {}
  const canvases: HTMLCanvasElement[] = []
  for (const [index, page] of pages.entries()) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * scale))
    canvas.height = Math.max(1, Math.round(size.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paintBackground(ctx, size, background, backgroundImage, layout.margin)
    drawPage(ctx, page, layout, size, meta)
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
