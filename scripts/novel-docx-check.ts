/**
 * Docx 导出自检：`npx tsx scripts/novel-docx-check.ts`
 *
 * 覆盖：书名 / 卷 / 章 / 节标题层级、XML 转义、分页、封面 / 作者 / 简介、
 * 插图内联（word/media + rels + drawing）、无图时保持旧行为（不产 media）。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildDocx,
  buildDocxParts,
  buildDocumentXml,
  type DocxImageAsset,
} from '../src/features/novel/docx'
import type { NovelExportChapter } from '../src/features/novel/export'
import { readZip } from '../src/lib/zip'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1
    console.log(`  OK ${name}`)
  } else {
    console.error(`  FAIL ${name}`)
    process.exitCode = 1
  }
}

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const TEXT = new TextDecoder()

async function main(): Promise<void> {
  const chapters: NovelExportChapter[] = [
    { title: '第一部 蜂群', depth: 1, text: '' },
    {
      title: '第01章 雨季',
      depth: 2,
      text: '雨下了很久。\n\n她没有回头。',
      images: ['附件/插图2.png'],
    },
    { title: '第01节 巢门', depth: 3, text: '门开着。' },
  ]

  const assets: Record<string, DocxImageAsset> = {
    '附件/封面.png': {
      src: '附件/封面.png',
      fileName: 'image1.png',
      ext: 'png',
      widthPx: 1200,
      heightPx: 1800,
      bytes: PNG_MAGIC,
    },
    '附件/插图2.png': {
      src: '附件/插图2.png',
      fileName: 'image2.png',
      ext: 'png',
      widthPx: 2400,
      heightPx: 1600,
      bytes: PNG_MAGIC,
    },
  }
  const options = {
    title: '蜂群纪事',
    author: '林川',
    synopsis: '雨季之后。\n蜂群醒来。',
    coverSrc: '附件/封面.png',
    assets,
  }

  const xml = buildDocumentXml(chapters, options)
  check('document.xml 是 w:document', xml.includes('<w:document'))
  check('书名进 Title 样式', xml.includes('w:val="Title"'))
  check('作者进书名页', xml.includes('作者：林川'))
  check('简介两行都在', xml.includes('雨季之后。') && xml.includes('蜂群醒来。'))
  check('卷进 Heading1', xml.includes('w:val="Heading1"'))
  check('章进 Heading2', xml.includes('w:val="Heading2"'))
  check('节进 Heading3', xml.includes('w:val="Heading3"'))
  check('正文两段都在', xml.includes('雨下了很久。') && xml.includes('她没有回头。'))
  check('XML 转义 & 与 <', buildDocumentXml([{ title: 'a & b < c', depth: 2, text: '' }]).includes('a &amp; b &lt; c'))
  check('XML 没有裸 &', !/&(?!(amp|lt|gt|quot|apos);)/.test(xml))

  // ── 分页：封面 + 书名页之后每章另起一页
  const breaks = xml.match(/<w:br w:type="page"\/>/g)?.length ?? 0
  check('每章分页（含书名页）', breaks >= 4)

  // ── 插图内联：封面 + 章内图
  check('封面与插图都写进 drawing', (xml.match(/<w:drawing>/g)?.length ?? 0) === 2)
  const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((match) => ({
    cx: Number(match[1]),
    cy: Number(match[2]),
  }))
  check('两张图都有 extent', extents.length === 2)
  check('图片宽度不超过 A4 版心（600px）', extents.every((item) => item.cx <= 600 * 9525))
  check('宽图按 600px 收口', extents.some((item) => item.cx === 600 * 9525))
  check(
    '图片等比缩放（2400×1600 → 600×400）',
    extents.length === 2 && Math.abs(extents[1].cy / extents[1].cx - 1600 / 2400) < 0.01,
  )

  const parts = buildDocxParts(chapters, options)
  check('rels 登记封面', parts.documentRels.includes('media/image1.png'))
  check('rels 登记插图', parts.documentRels.includes('media/image2.png'))
  check('rels 有两条 image 关系', (parts.documentRels.match(/relationships\/image/g)?.length ?? 0) === 2)
  check('parts.media 两张图', parts.media.length === 2)

  // ── 打包：zip 里真的带 media
  const blob = buildDocx(chapters, options)
  check('docx 体积正常', blob.size > 1000)
  const bytes = Buffer.from(await blob.arrayBuffer())
  check('ZIP 魔数 PK 03 04', bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)

  const entries = await readZip(await blob.arrayBuffer())
  check('docx zip 含封面 media', entries.has('word/media/image1.png'))
  check('docx zip 含插图 media', entries.has('word/media/image2.png'))
  const media = entries.get('word/media/image2.png')
  check('media 字节原样写入', media !== undefined && media.length === PNG_MAGIC.length && media[0] === 0x89)
  const relsText = TEXT.decode(entries.get('word/_rels/document.xml.rels') ?? new Uint8Array())
  check('zip 内 rels 指向 media', relsText.includes('media/image1.png') && relsText.includes('media/image2.png'))
  const contentTypes = TEXT.decode(entries.get('[Content_Types].xml') ?? new Uint8Array())
  check('Content_Types 声明 png', contentTypes.includes('Extension="png"'))
  const packedXml = TEXT.decode(entries.get('word/document.xml') ?? new Uint8Array())
  check('zip 内 document.xml 有 drawing', packedXml.includes('<w:drawing>'))

  // ── 没有图片时保持旧行为：不产 media、仍是合法 docx
  const plainBlob = buildDocx(chapters, { title: '蜂群纪事' })
  const plainEntries = await readZip(await plainBlob.arrayBuffer())
  check('无图导出不含 word/media', ![...plainEntries.keys()].some((name) => name.startsWith('word/media/')))
  check('无图导出仍有正文', TEXT.decode(plainEntries.get('word/document.xml') ?? new Uint8Array()).includes('雨下了很久。'))

  const dir = join(tmpdir(), 'oc-docx-check')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '蜂群纪事.docx')
  writeFileSync(file, bytes)
  console.log(`  · 已写出 ${file}`)
  console.log(`\n共 ${passed} 项断言通过`)
  console.log(file)
}

void main()
