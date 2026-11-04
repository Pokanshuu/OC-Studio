/**
 * Docx 导出（W2 收尾 / N2 扩展）：章节树 → Word 文档。
 *
 * 不引第三方库：docx 就是一个 ZIP，里面是 WordprocessingML。
 * ZIP 用我们自己的 `lib/zip.ts`（store-only 写入，Word 完全接受）。
 *
 * 版式策略（`docs/小说.md` §4 / §5）：
 * **只做结构，不做排版** —— 章标题进 Heading、正文成段、卷用 Heading1；
 * 字体、页边距、页眉页脚交给 Word 模板，我们不写死。
 *
 * N2 新增（全部可选，没有就退化成原来的纯文本导出）：
 * - 封面图（`coverSrc`）+ 作者 + 简介
 * - 每章分页（`<w:br w:type="page"/>`）
 * - 章内插图内联（`NovelExportChapter.images` → `word/media/*` + rels + `<w:drawing>`）
 *
 * 图片按 A4 正文宽度收口（约 600px），等比缩放；读不到字节的图跳过，
 * 正文照常导出 —— 不能因为一张图丢了整本书。
 */
import { createZip, downloadBlob, type ZipEntryInput } from '@/lib/zip'
import type { NovelExportChapter } from './export'

const encoder = new TextEncoder()

/** A4 正文宽度约 600px（11906 twips - 左右各 1440） */
const EMU_PER_PX = 9525
const MAX_IMAGE_WIDTH_EMU = 600 * EMU_PER_PX
const MAX_IMAGE_HEIGHT_EMU = 820 * EMU_PER_PX

export type DocxImageExt = 'png' | 'jpeg' | 'gif' | 'webp'

export interface DocxImageAsset {
  /** 与 `NovelExportChapter.images` 里的字符串一致（相对路径或 data URL） */
  src: string
  /** word/media 下的文件名 */
  fileName: string
  ext: DocxImageExt
  widthPx: number
  heightPx: number
  bytes: Uint8Array
}

export interface DocxOptions {
  title?: string
  author?: string
  synopsis?: string
  /** 封面图源（需同时出现在 `assets` 里） */
  coverSrc?: string
  /** 已准备好的图片：src → 资源。buildDocx 据此写 media 与 rels */
  assets?: Record<string, DocxImageAsset>
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Default Extension="webp" ContentType="image/webp"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

/** 极简样式表：正文 + 三级标题 + 书名页（只定字号/加粗，主题字体交给 Word） */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="480"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="1200" w:after="240"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Synopsis"><w:name w:val="Synopsis"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="480" w:after="240"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="360" w:after="180"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function paragraph(text: string, styleId?: string): string {
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ''
  if (text.trim().length === 0) return `<w:p>${pPr}</w:p>`
  // 段内换行 → <w:br/>
  const runs = text
    .split('\n')
    .map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join('')
  return `<w:p>${pPr}${runs}</w:p>`
}

function pageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function imageParagraph(
  relId: string,
  imageId: number,
  widthPx: number,
  heightPx: number,
  name: string,
): string {
  const sourceWidth = Math.max(1, Math.round(widthPx))
  const sourceHeight = Math.max(1, Math.round(heightPx))
  const scale = Math.min(
    1,
    MAX_IMAGE_WIDTH_EMU / (sourceWidth * EMU_PER_PX),
    MAX_IMAGE_HEIGHT_EMU / (sourceHeight * EMU_PER_PX),
  )
  const cx = Math.max(1, Math.round(sourceWidth * EMU_PER_PX * scale))
  const cy = Math.max(1, Math.round(sourceHeight * EMU_PER_PX * scale))
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imageId}" name="${escapeXml(name)} ${imageId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageId}" name="image${imageId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

export interface DocxParts {
  documentXml: string
  documentRels: string
  media: ZipEntryInput[]
}

/**
 * 章节序列 → document.xml + rels + media（不打包）。
 *
 * 单独暴露是为了让脚本能在 Node 里用假图片资源验证 XML，
 * 不必依赖 DOM / 真实图片解码。
 */
export function buildDocxParts(
  chapters: NovelExportChapter[],
  options: DocxOptions = {},
): DocxParts {
  const paragraphs: string[] = []
  const rels: string[] = []
  const relBySrc = new Map<string, string>()
  const used = new Map<string, DocxImageAsset>()
  let relSeq = 1 // rId1 留给 styles.xml
  let drawingSeq = 0

  const relFor = (asset: DocxImageAsset): string => {
    const cached = relBySrc.get(asset.src)
    if (cached) return cached
    relSeq += 1
    const id = `rId${relSeq}`
    relBySrc.set(asset.src, id)
    used.set(asset.src, asset)
    rels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(asset.fileName)}"/>`,
    )
    return id
  }

  const emitImage = (src: string | undefined, name: string): void => {
    if (!src) return
    const asset = options.assets?.[src]
    if (!asset) return
    drawingSeq += 1
    paragraphs.push(imageParagraph(relFor(asset), drawingSeq, asset.widthPx, asset.heightPx, name))
  }

  const cover = options.coverSrc ? options.assets?.[options.coverSrc] : undefined
  const hasFrontMatter = Boolean(options.title || options.author?.trim() || options.synopsis?.trim())
  if (cover) {
    emitImage(options.coverSrc, '封面')
    if (hasFrontMatter) paragraphs.push(pageBreak())
  }
  if (options.title) paragraphs.push(paragraph(options.title, 'Title'))
  if (options.author?.trim()) paragraphs.push(paragraph(`作者：${options.author.trim()}`, 'Subtitle'))
  if (options.synopsis?.trim()) {
    for (const line of options.synopsis.split(/\n+/)) {
      if (line.trim()) paragraphs.push(paragraph(line.trim(), 'Synopsis'))
    }
  }

  for (const chapter of chapters) {
    // 每章另起一页；第一段内容前面不加，否则 Word 会多出一张空白页
    if (paragraphs.length > 0) paragraphs.push(pageBreak())
    const style = chapter.depth <= 1 ? 'Heading1' : chapter.depth === 2 ? 'Heading2' : 'Heading3'
    paragraphs.push(paragraph(chapter.title, style))
    chapter.text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .forEach((block) => paragraphs.push(paragraph(block)))
    for (const src of chapter.images ?? []) emitImage(src, '插图')
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${rels.join('\n  ')}
</Relationships>`

  const media: ZipEntryInput[] = [...used.values()].map((asset) => ({
    name: `word/media/${asset.fileName}`,
    data: asset.bytes,
  }))

  return { documentXml, documentRels, media }
}

/** 章节序列 → WordprocessingML（无图片时与旧版一致；图片由 `buildDocxParts` 一并产出 rels） */
export function buildDocumentXml(
  chapters: NovelExportChapter[],
  options: DocxOptions = {},
): string {
  return buildDocxParts(chapters, options).documentXml
}

/** 章节序列 → docx Blob（可直接 `downloadBlob`） */
export function buildDocx(chapters: NovelExportChapter[], options: DocxOptions = {}): Blob {
  const { documentXml, documentRels, media } = buildDocxParts(chapters, options)
  const files: ZipEntryInput[] = [
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(RELS) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(documentRels) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES) },
    ...media,
  ]
  return createZip(files)
}

/* --------------------------------------------------------------------------
 * 图片读取：data URL / 库内相对路径 / Tauri 绝对路径 / http(s)
 * -------------------------------------------------------------------------- */

function extensionOf(path: string): DocxImageExt | null {
  const match = /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.exec(path)
  if (!match) return null
  const ext = match[1].toLowerCase()
  return ext === 'jpg' ? 'jpeg' : (ext as DocxImageExt)
}

function extensionOfMime(mime: string): DocxImageExt | null {
  const lower = mime.toLowerCase()
  if (lower.includes('png')) return 'png'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg'
  if (lower.includes('gif')) return 'gif'
  if (lower.includes('webp')) return 'webp'
  return null
}

function sniffExtension(bytes: Uint8Array): DocxImageExt | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}

function decodeDataUrl(src: string): { bytes: Uint8Array; ext: DocxImageExt } | null {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(src)
  if (!match) return null
  const declared = extensionOfMime(match[1])
  if (!declared) return null
  try {
    const binary = atob(match[2].replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    if (bytes.length === 0) return null
    return { bytes, ext: sniffExtension(bytes) ?? declared }
  } catch {
    return null
  }
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; ext: DocxImageExt } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const ext = extensionOfMime(blob.type) ?? sniffExtension(bytes)
    if (!ext || bytes.length === 0) return null
    return { bytes, ext }
  } catch {
    return null
  }
}

/** 按运行环境把图片源读成字节；读不到返回 null（导出时跳过这张图） */
async function readImageSource(
  src: string,
): Promise<{ bytes: Uint8Array; ext: DocxImageExt } | null> {
  const data = decodeDataUrl(src)
  if (data) return data
  if (/^(https?:|blob:)/i.test(src)) return fetchImage(src)

  const absolute = /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')
  const { isTauri } = await import('@/lib/env')

  if (!absolute) {
    // 库内相对路径：桌面端直接走 Rust 读字节，绕开 asset 协议与 CORS
    const { getVaultImageContext } = await import('@/lib/image-service')
    const root = getVaultImageContext()?.root
    if (root) {
      try {
        const { vaultFs } = await import('@/lib/vault/vault-fs')
        const bytes = new Uint8Array(await vaultFs.readBytes(root, src))
        if (bytes.length === 0) return null
        return { bytes, ext: sniffExtension(bytes) ?? extensionOf(src) ?? 'png' }
      } catch {
        return null
      }
    }
    if (!isTauri()) return null
    const { resolveImageUrl } = await import('@/lib/image-service')
    return fetchImage(resolveImageUrl(src, 'header'))
  }

  if (isTauri()) {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    return fetchImage(convertFileSrc(src))
  }
  return fetchImage(src)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function measureImageSize(
  bytes: Uint8Array,
  ext: DocxImageExt,
): Promise<{ width: number; height: number }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') {
    return { width: 800, height: 600 }
  }
  const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: `image/${ext}` }))
  try {
    return await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image()
      image.onload = () =>
        resolve({
          width: image.naturalWidth > 0 ? image.naturalWidth : 800,
          height: image.naturalHeight > 0 ? image.naturalHeight : 600,
        })
      image.onerror = () => resolve({ width: 800, height: 600 })
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type NovelDocxOptions = DocxOptions

/**
 * 把章节里引用到的图片读成字节（封面优先，其余按章内顺序），
 * 生成 `buildDocx` 需要的 assets。读不到的图直接缺席，不会让导出失败。
 */
export async function prepareDocxAssets(
  chapters: NovelExportChapter[],
  options: Pick<DocxOptions, 'coverSrc'> = {},
): Promise<Record<string, DocxImageAsset>> {
  const sources = [
    ...(options.coverSrc ? [options.coverSrc] : []),
    ...chapters.flatMap((chapter) => chapter.images ?? []),
  ]
  const seen = new Set<string>()
  const assets: Record<string, DocxImageAsset> = {}
  let index = 0
  for (const src of sources) {
    if (!src || seen.has(src)) continue
    seen.add(src)
    const read = await readImageSource(src)
    if (!read) continue
    const size = await measureImageSize(read.bytes, read.ext)
    index += 1
    assets[src] = {
      src,
      fileName: `image${index}.${read.ext}`,
      ext: read.ext,
      widthPx: size.width,
      heightPx: size.height,
      bytes: read.bytes,
    }
  }
  return assets
}

/** 完整导出：读图 + 打包。浏览器 / Tauri 里由导出对话框调用 */
export async function buildNovelDocx(
  chapters: NovelExportChapter[],
  options: DocxOptions = {},
): Promise<Blob> {
  const assets = await prepareDocxAssets(chapters, options)
  return buildDocx(chapters, { ...options, assets })
}

/** 完整导出 + 触发下载（文件名由调用方净化） */
export async function downloadNovelDocx(
  chapters: NovelExportChapter[],
  options: DocxOptions = {},
  fileName?: string,
): Promise<void> {
  const blob = await buildNovelDocx(chapters, options)
  const safe = (fileName ?? options.title ?? '小说').replace(/[\\/:*?"<>|]/g, '-').trim() || '小说'
  downloadBlob(blob, safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`)
}
