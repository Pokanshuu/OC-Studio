/**
 * Docx 导出自检：`npx tsx scripts/novel-docx-check.ts`
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildDocx, buildDocumentXml } from '../src/features/novel/docx'
import type { NovelExportChapter } from '../src/features/novel/export'

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

async function main(): Promise<void> {
  const chapters: NovelExportChapter[] = [
    { title: '第一部 蜂群', depth: 1, text: '' },
    { title: '第01章 雨季', depth: 2, text: '雨下了很久。\n\n她没有回头。' },
    { title: '第01节 巢门', depth: 3, text: '门开着。' },
  ]

  const xml = buildDocumentXml(chapters, { title: '蜂群纪事' })
  check('document.xml 是 w:document', xml.includes('<w:document'))
  check('书名进 Title 样式', xml.includes('w:val="Title"'))
  check('卷进 Heading1', xml.includes('w:val="Heading1"'))
  check('章进 Heading2', xml.includes('w:val="Heading2"'))
  check('节进 Heading3', xml.includes('w:val="Heading3"'))
  check('正文两段都在', xml.includes('雨下了很久。') && xml.includes('她没有回头。'))
  check('XML 转义 & 与 <', buildDocumentXml([{ title: 'a & b < c', depth: 2, text: '' }]).includes('a &amp; b &lt; c'))

  const blob = buildDocx(chapters, { title: '蜂群纪事' })
  check('docx 体积正常', blob.size > 1000)

  const bytes = Buffer.from(await blob.arrayBuffer())
  check('ZIP 魔数 PK 03 04', bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)

  const dir = join(tmpdir(), 'oc-docx-check')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '蜂群纪事.docx')
  writeFileSync(file, bytes)
  console.log(`  · 已写出 ${file}`)
  console.log(`\n共 ${passed} 项断言通过`)
  console.log(file)
}

void main()
