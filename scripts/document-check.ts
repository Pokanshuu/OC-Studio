/**
 * 文档导出自检：`npx tsx scripts/document-check.ts`
 *
 * 不打开浏览器，只验「模型 → 三个格式」这一段：
 * - Markdown / TXT：不把 HTML 当字面量写出去（旧版会把 `<p></p>` 原样塞进 .md）
 * - Word：XML 结构合法（标题 / 分区 / 条目 / 字段都在，转义正确），能装进 ZIP
 * - 分区裁剪：关掉的分区既不进预览也不进文件
 *
 * 读库那一段（`buildDocumentModel`）依赖 IndexedDB，留给手工验收；
 * 这里用手写模型喂三个纯函数。
 */
import { renderMarkdown, renderTxt } from '../src/lib/export/markdown'
import { pageDocEntryCount, pageDocIsEmpty, pageHtmlFromText } from '../src/lib/export/page'
import { toPageDoc } from '../src/lib/export/document'
import { buildDocumentDocx, buildDocumentXml } from '../src/lib/export/document-docx'
import type { DocumentModel } from '../src/lib/export/document'

let passed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  failures.push(detail ? `${name}：${detail}` : name)
}

const MODEL: DocumentModel = {
  title: '北境纪事',
  subtitle: 'OC Studio 导出 · 2026-11-05',
  total: 2,
  sections: [
    {
      key: 'characters',
      label: '角色',
      entries: [
        {
          id: '角色:1',
          title: '荠仁',
          fields: [
            { label: '别名', value: '群青酱' },
            { label: '身高', value: '210cm' },
          ],
          html: '<p>在铁国的边城开了间诊所。</p>',
          text: '在铁国的边城开了间诊所。\n\n他不谈过去。',
        },
      ],
    },
    {
      key: 'events',
      label: '事件',
      entries: [
        {
          id: '事件:1',
          title: '灰潮之夜',
          fields: [{ label: '时间', value: '纪年 412 年冬' }],
          html: '<p>潮水退了以后。</p>',
          text: '潮水退了以后。',
        },
      ],
    },
  ],
}

// ── 1. Markdown ────────────────────────────────────────────
const md = renderMarkdown(MODEL)
check('md 以标题开头', md.startsWith('# 北境纪事'))
check('md 带口径行', md.includes('> OC Studio 导出'))
check('md 分区是二级标题', md.includes('## 角色') && md.includes('## 事件'))
check('md 条目是三级标题', md.includes('### 荠仁') && md.includes('### 灰潮之夜'))
check('md 字段成列表项', md.includes('- 别名：群青酱'))
check('md 正文用纯文本而不是 HTML', md.includes('在铁国的边城开了间诊所。'))
check('md 不残留空段落标签', !md.includes('<p>') && !md.includes('</p>'))
check('md 不漏正文第二段', md.includes('他不谈过去。'))
check(
  'md 不出现三连空行',
  !/\n{3,}/.test(md),
)

// ── 2. TXT ─────────────────────────────────────────────────
const txt = renderTxt(MODEL)
check('txt 有标题下划线', txt.split('\n')[1].startsWith('='))
check('txt 分区用【】', txt.includes('【角色】') && txt.includes('【事件】'))
check('txt 字段是「标签：值」', txt.includes('  别名：群青酱'))
check('txt 不带 Markdown 标题记号', !txt.includes('### '))
check('txt 不残留 HTML', !txt.includes('<p>'))

// ── 3. Word ────────────────────────────────────────────────
const xml = buildDocumentXml(MODEL)
check('docx xml 有声明', xml.startsWith('<?xml version="1.0"'))
check('docx 有正文体', xml.includes('<w:body>') && xml.includes('</w:body>'))
check('docx 有页面尺寸', xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'))
check('docx 标题走 DocTitle', xml.includes('w:val="DocTitle"') && xml.includes('北境纪事'))
check('docx 分区走 Heading1', (xml.match(/w:val="Heading1"/g) ?? []).length === 2)
check('docx 条目走 Heading2', (xml.match(/w:val="Heading2"/g) ?? []).length === 2)
check('docx 字段标签加粗', xml.includes('<w:b/>') && xml.includes('别名：'))
check('docx 正文两段都在', xml.includes('在铁国的边城开了间诊所。') && xml.includes('他不谈过去。'))
check('docx 不出现空段落标签', !xml.includes('&lt;p&gt;'))

const tricky = buildDocumentXml({
  ...MODEL,
  title: 'A & B <测试>',
})
check('docx 转义 &', tricky.includes('A &amp; B'))
check('docx 转义尖括号', tricky.includes('&lt;测试&gt;') && !tricky.includes('<测试>'))

const blob = buildDocumentDocx(MODEL)
check('docx 打包成 blob', blob.size > 1000, String(blob.size))

// ── 4. 预览模型（与小说共用 `PagePreview`）──────────────────
const page = toPageDoc(MODEL)
check('page doc 带标题', page.title === '北境纪事')
check('page doc 分区数一致', page.sections.length === MODEL.sections.length)
check('page doc 条目 id 保持稳定', page.sections[0].entries[0].id === '角色:1')
check('page doc 保留字段', (page.sections[0].entries[0].fields ?? []).length === 2)
check('page doc 保留正文 HTML', (page.sections[0].entries[0].html ?? '').includes('<p>'))
check('空模型判空', pageDocIsEmpty({ title: 'x', sections: [{ id: 'a', entries: [] }] }))
check('有条目不算空', !pageDocIsEmpty(page))
check('条目计数', pageDocEntryCount(page) === 2)
check('纯文本转 HTML 分段', pageHtmlFromText('第一段\n\n第二段').includes('<p>第一段</p>'))
check('空文本不产 HTML', pageHtmlFromText('   ') === '')

// ── 5. 分区裁剪（面板的 visibleModel 语义）───────────────
const onlyCharacters: DocumentModel = {
  ...MODEL,
  sections: MODEL.sections.filter((section) => section.key === 'characters'),
}
onlyCharacters.total = onlyCharacters.sections.reduce((sum, section) => sum + section.entries.length, 0)
check('关掉事件后 md 里没有事件', !renderMarkdown(onlyCharacters).includes('## 事件'))
check('关掉事件后 docx 只有一个分区标题', (buildDocumentXml(onlyCharacters).match(/w:val="Heading1"/g) ?? []).length === 1)
check('关掉事件后 total 只算角色', onlyCharacters.total === 1)

if (failures.length > 0) {
  console.error('文档导出自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`文档导出自检通过：${passed} 项断言（Markdown / TXT / Word XML / 预览模型 / 分区裁剪）`)
