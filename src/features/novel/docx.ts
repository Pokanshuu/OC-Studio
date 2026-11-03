/**
 * Docx 导出（W2 收尾）：章节树 → Word 文档。
 *
 * 不引第三方库：docx 就是一个 ZIP，里面是 WordprocessingML。
 * ZIP 用我们自己的 `lib/zip.ts`（store-only 写入，Word 完全接受）。
 *
 * 版式策略（`docs/小说.md` §4 / §5）：
 * **只做结构，不做排版** —— 章标题进 Heading、正文成段、卷用 Heading1；
 * 字体、页边距、页眉页脚交给 Word 模板，我们不写死。
 */
import { createZip, type ZipEntryInput } from '@/lib/zip'
import type { NovelExportChapter } from './export'

const encoder = new TextEncoder()

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

/** 极简样式表：正文 + 三级标题（只定字号/加粗，主题字体交给 Word） */
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
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
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

/**
 * 章节序列 → WordprocessingML。
 *
 * - `depth === 1`（卷）→ 居中大标题
 * - `depth === 2`（章）→ Heading2
 * - 更深的（节）→ Heading3
 * - 正文按空行切段
 */
export function buildDocumentXml(chapters: NovelExportChapter[], options: { title?: string } = {}): string {
  const parts: string[] = []
  if (options.title) parts.push(paragraph(options.title, 'Title'))
  for (const chapter of chapters) {
    const style = chapter.depth <= 1 ? 'Heading1' : chapter.depth === 2 ? 'Heading2' : 'Heading3'
    parts.push(paragraph(chapter.title, style))
    chapter.text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .forEach((block) => parts.push(paragraph(block)))
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`
}

const CRC_STORE = 0 // zip.ts 的 store 模式不需要额外参数，这里只是可读性占位

/** 章节序列 → docx Blob（可直接 `downloadBlob`） */
export function buildDocx(chapters: NovelExportChapter[], options: { title?: string } = {}): Blob {
  void CRC_STORE
  const files: ZipEntryInput[] = [
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(RELS) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOC_RELS) },
    { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(chapters, options)) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES) },
  ]
  return createZip(files)
}
