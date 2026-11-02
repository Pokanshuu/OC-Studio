'use client'

import { getImageUrl } from '@/lib/image-service'
import type { Novel, NovelExportOptions, NovelPageFormat } from './types'
import { getNovelPageDimensions, novelBackgroundDataUrl } from './background'

export interface NovelPageImage {
  dataUrl: string
  width: number
  height: number
  title: string
  /** 0 for the cover, 1..n for numbered content pages. */
  pageNumber: number
  isCover: boolean
}

export interface NovelBlock {
  kind: 'heading' | 'paragraph' | 'quote' | 'list' | 'image'
  text?: string
  src?: string
}

export function parseNovelBlocks(html: string): NovelBlock[] {
  if (typeof window === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: NovelBlock[] = []

  const visit = (node: Element): void => {
    const tag = node.tagName.toLowerCase()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = node.textContent?.trim()
      if (text) blocks.push({ kind: 'heading', text })
      return
    }
    if (tag === 'blockquote') {
      const text = node.textContent?.trim()
      if (text) blocks.push({ kind: 'quote', text })
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      for (const li of Array.from(node.querySelectorAll(':scope > li'))) {
        const text = li.textContent?.trim()
        if (text) blocks.push({ kind: 'list', text })
      }
      return
    }
    if (tag === 'img') {
      const src = node.getAttribute('src')
      if (src) blocks.push({ kind: 'image', src })
      return
    }
    if (node.getAttribute('data-type') === 'image-block') {
      const src = node.getAttribute('src')
      if (src) blocks.push({ kind: 'image', src })
      return
    }
    if (tag === 'p') {
      const text = node.textContent?.trim()
      if (text) blocks.push({ kind: 'paragraph', text })
      return
    }
    if (tag === 'div') {
      for (const child of Array.from(node.children)) visit(child)
      return
    }
    const text = node.textContent?.trim()
    if (text) blocks.push({ kind: 'paragraph', text })
  }

  for (const child of Array.from(doc.body.children)) visit(child)
  return blocks
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = getImageUrl(src, 'avatar')
  })
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sw = width / scale
  const sh = height / scale
  const sx = (image.naturalWidth - sw) / 2
  const sy = (image.naturalHeight - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height)
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): number {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, x + (maxWidth - width) / 2, y, width, height)
  return height
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    let line = ''
    for (const char of Array.from(paragraph)) {
      const candidate = line + char
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line)
        line = char
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
  }
  return lines.length > 0 ? lines : ['']
}

export async function renderNovelPages(
  novel: Novel,
  options: NovelExportOptions,
): Promise<NovelPageImage[]> {
  const { width, height } = getNovelPageDimensions(options.format, options.scale)
  const unit = Math.min(width, height)
  const margin = Math.round(unit * 0.095)
  const contentWidth = width - margin * 2
  const contentTop = margin + unit * 0.035
  const contentBottom = height - margin - unit * 0.04
  const bodySize = Math.max(16, Math.round(unit * 0.029))
  const lineHeight = Math.round(bodySize * 1.9)
  const titleSize = Math.round(bodySize * 2.3)
  const chapterSize = Math.round(bodySize * 1.55)
  const fontFamily = '"Noto Serif SC", "Songti SC", "SimSun", serif'
  const ink = '#3b3227'

  const backgroundSrc =
    options.backgroundUrl || novelBackgroundDataUrl(width, height)
  const background = await loadImage(backgroundSrc)

  const images = new Map<string, HTMLImageElement | null>()
  const chapterBlocks = novel.chapters.map((chapter) => ({
    chapter,
    blocks: parseNovelBlocks(chapter.content),
  }))
  for (const { blocks } of chapterBlocks) {
    for (const block of blocks) {
      if (block.kind === 'image' && block.src && !images.has(block.src)) {
        images.set(block.src, await loadImage(block.src))
      }
    }
  }

  const pages: NovelPageImage[] = []

  const createPage = (): CanvasRenderingContext2D => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    if (background) drawCoverImage(ctx, background, 0, 0, width, height)
    else {
      ctx.fillStyle = '#ead9ba'
      ctx.fillRect(0, 0, width, height)
    }
    // Uploaded backgrounds can be busy, so give them a readable inner panel.
    // The default frame is clean enough that a panel would hide its corners.
    if (options.backgroundUrl) {
      ctx.fillStyle = 'rgba(250, 245, 234, 0.84)'
      ctx.fillRect(margin * 0.55, margin * 0.45, width - margin * 1.1, height - margin * 0.9)
    }
    ctx.fillStyle = ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    pages.push({
      dataUrl: '',
      width,
      height,
      title: novel.title,
      pageNumber: 0,
      isCover: false,
    })
    return ctx
  }

  // Cover
  {
    const ctx = createPage()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#6b5638'
    ctx.font = `600 ${Math.round(titleSize * 0.52)}px ${fontFamily}`
    ctx.fillText(novel.author ? `著 / ${novel.author}` : 'OC STUDIO', width / 2, height * 0.26)
    ctx.fillStyle = ink
    ctx.font = `700 ${titleSize}px ${fontFamily}`
    const titleLines = wrapText(ctx, novel.title || '未命名小说', contentWidth * 0.9)
    let titleY = height * 0.34
    for (const line of titleLines) {
      ctx.fillText(line, width / 2, titleY)
      titleY += titleSize * 1.35
    }
    ctx.strokeStyle = 'rgba(122, 96, 58, 0.55)'
    ctx.lineWidth = Math.max(1, unit * 0.002)
    ctx.beginPath()
    ctx.moveTo(width * 0.36, titleY + titleSize * 0.45)
    ctx.lineTo(width * 0.64, titleY + titleSize * 0.45)
    ctx.stroke()
    if (novel.synopsis.trim()) {
      ctx.fillStyle = '#5b4b37'
      ctx.font = `${Math.round(bodySize * 0.9)}px ${fontFamily}`
      const lines = wrapText(ctx, novel.synopsis.trim(), contentWidth * 0.78)
      let y = titleY + titleSize
      for (const line of lines.slice(0, 8)) {
        ctx.fillText(line, width / 2, y)
        y += bodySize * 1.7
      }
    }
    const canvas = ctx.canvas
    pages[pages.length - 1].dataUrl = canvas.toDataURL('image/png')
    pages[pages.length - 1].title = `${novel.title} · 封面`
    pages[pages.length - 1].pageNumber = 0
    pages[pages.length - 1].isCover = true
  }

  let contentPageNumber = 0
  for (const { chapter, blocks } of chapterBlocks) {
    let ctx = createPage()
    let y = contentTop
    let pageIndex = pages.length
    // The cover is not a numbered content page; chapter text starts at 1.
    contentPageNumber += 1
    pages[pageIndex - 1].pageNumber = contentPageNumber
    pages[pageIndex - 1].isCover = false

    const newPage = (): void => {
      const canvas = ctx.canvas
      ctx.fillStyle = 'rgba(80, 64, 45, 0.65)'
      ctx.font = `${Math.round(bodySize * 0.7)}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.fillText(String(contentPageNumber), width / 2, height - margin * 0.62)
      pages[pageIndex - 1].dataUrl = canvas.toDataURL('image/png')
      ctx = createPage()
      pageIndex = pages.length
      contentPageNumber += 1
      pages[pageIndex - 1].pageNumber = contentPageNumber
      pages[pageIndex - 1].isCover = false
      y = contentTop
    }

    const ensureSpace = (needed: number): void => {
      if (y + needed > contentBottom) newPage()
    }

    ctx.textAlign = 'center'
    ctx.fillStyle = ink
    ctx.font = `600 ${chapterSize}px ${fontFamily}`
    const chapterTitleLines = wrapText(ctx, chapter.title || '未命名章节', contentWidth)
    for (const line of chapterTitleLines) {
      ensureSpace(chapterSize * 1.5)
      ctx.fillText(line, width / 2, y)
      y += chapterSize * 1.35
    }
    y += bodySize * 0.6
    ctx.textAlign = 'left'
    ctx.font = `${bodySize}px ${fontFamily}`

    for (const block of blocks) {
      if (block.kind === 'image' && block.src) {
        const image = images.get(block.src)
        if (!image) continue
        const maxHeight = (contentBottom - contentTop) * 0.55
        const scale = Math.min(contentWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1)
        const imageHeight = image.naturalHeight * scale
        ensureSpace(imageHeight + bodySize)
        const heightDrawn = drawContainedImage(ctx, image, margin, y, contentWidth, maxHeight)
        y += heightDrawn + bodySize * 0.9
        ctx.font = `${bodySize}px ${fontFamily}`
        ctx.fillStyle = ink
        continue
      }

      const text = block.text ?? ''
      if (!text.trim()) continue
      const isHeading = block.kind === 'heading'
      const isQuote = block.kind === 'quote'
      const isList = block.kind === 'list'
      ctx.font =
        isHeading
          ? `600 ${Math.round(bodySize * 1.28)}px ${fontFamily}`
          : `${bodySize}px ${fontFamily}`
      ctx.fillStyle = isQuote ? '#66533c' : ink
      const lines = wrapText(
        ctx,
        `${isList ? '· ' : ''}${text}`,
        isQuote ? contentWidth * 0.9 : contentWidth,
      )
      const lineH = isHeading ? lineHeight * 1.15 : lineHeight
      for (const line of lines) {
        ensureSpace(lineH)
        const x = isQuote ? margin + bodySize : margin
        ctx.fillText(line, x, y)
        y += lineH
      }
      y += isHeading ? bodySize * 0.65 : bodySize * 0.45
    }

    // Flush the chapter's final page.
    ctx.fillStyle = 'rgba(80, 64, 45, 0.65)'
    ctx.font = `${Math.round(bodySize * 0.7)}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.fillText(String(contentPageNumber), width / 2, height - margin * 0.62)
    pages[pageIndex - 1].dataUrl = ctx.canvas.toDataURL('image/png')
    pages[pageIndex - 1].title = chapter.title
  }

  return pages
}

export function novelPageFileLabel(page: NovelPageImage): string {
  return page.isCover ? '封面' : String(page.pageNumber || 1).padStart(2, '0')
}

export function downloadNovelPage(page: NovelPageImage, fileName: string): void {
  const link = document.createElement('a')
  link.href = page.dataUrl
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function pagePixelLabel(format: NovelPageFormat, scale: number): string {
  const { width, height } = getNovelPageDimensions(format, scale)
  return `${width} × ${height}`
}
