/**
 * 文档 → Word（`.docx`）。
 *
 * 与小说导出（`features/novel/docx.ts`）同一个思路：docx 就是一只 ZIP 里面装
 * WordprocessingML，ZIP 用 `lib/zip.ts`（store-only，Word 完全接受），不引第三方。
 * 两份实现不合并：小说是「章节流」，文档是「分区 → 条目 → 字段 + 正文」，
 * 硬套一份会互相拖累。
 *
 * 版式同样**只做结构不做排版**：标题、分区、条目走 Heading 1/2，正文字体与页边距
 * 交给 Word 模板 —— 用户真要调版式，应该去 Word 里调，而不是让我们再发明一套。
 */
import { createZip, type ZipEntryInput } from '@/lib/zip'
import type { DocumentModel } from './document'

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

/**
 * 分区第一个条目另起一页，所以用 `Heading1` 且带分页前的 `pageBreakBefore`；
 * 首屏的「标题页」只放文档标题与口径，不抢正文的页。
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="DocTitle"><w:name w:val="Doc Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="DocSubtitle"><w:name w:val="Doc Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="21"/><w:color w:val="6E6A63"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="480" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="DocField"><w:name w:val="Doc Field"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="240"/></w:pPr><w:rPr><w:sz w:val="21"/></w:rPr></w:style>
</w:styles>`

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function runsOf(text: string): string {
  return text
    .split('\n')
    .map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join('')
}

function paragraph(text: string, styleId?: string): string {
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ''
  return `<w:p>${pPr}${runsOf(text)}</w:p>`
}

/** 「标签：值」——标签加粗，值常规。 */
function fieldParagraph(label: string, value: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="DocField"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}：</w:t></w:r><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`
}

function bodyParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => paragraph(line))
}

/** 模型 → `word/document.xml`（单独暴露，脚本里不必解 ZIP 就能验结构）。 */
export function buildDocumentXml(model: DocumentModel): string {
  const blocks: string[] = [paragraph(model.title, 'DocTitle'), paragraph(model.subtitle, 'DocSubtitle')]

  for (const section of model.sections) {
    blocks.push(paragraph(section.label, 'Heading1'))
    for (const entry of section.entries) {
      blocks.push(paragraph(entry.title, 'Heading2'))
      for (const field of entry.fields) blocks.push(fieldParagraph(field.label, field.value))
      blocks.push(...bodyParagraphs(entry.text))
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${blocks.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`
}

export function buildDocumentDocx(model: DocumentModel): Blob {
  const files: ZipEntryInput[] = [
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(RELS) },
    { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(model)) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES) },
  ]
  return createZip(files)
}
