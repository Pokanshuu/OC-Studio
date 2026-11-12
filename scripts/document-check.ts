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
import { selectDocumentEntries, toPageDoc } from '../src/lib/export/document'
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

// ── 6. 正文里的表格与图片 ─────────────────────────────────────────────
// 文档导出**只用文字**（正文图片不进 docx，面板里已写明）。这里钉两件事：
// 表格里的字不能丢；图片不能被当成字面量 `<img ...>` 印出来。
{
  const richModel: DocumentModel = {
    title: '富文本',
    subtitle: '',
    total: 1,
    sections: [
      {
        key: 'characters',
        label: '角色',
        entries: [
          {
            id: '角色:9',
            title: '带表格与图',
            fields: [],
            text: '表格前\n▦ 单元格甲 | 单元格乙\n▦ 单元格丙 | 单元格丁\n表格后',
            html: '<p>表格前</p><table><tr><td>单元格甲</td><td>单元格乙</td></tr></table><figure><img src="附件/x.png"></figure>',
          },
        ],
      },
    ],
  }
  const xml = buildDocumentXml(richModel)
  check('表格文字进 Word', xml.includes('单元格甲') && xml.includes('单元格丁'), xml.slice(0, 120))
  check('图片的 src 不会被印成字面量', !xml.includes('<img') && !xml.includes('附件/x.png'))
  check('正文前后的文字都在', xml.includes('表格前') && xml.includes('表格后'))
}

// ── 7. 导出范围：分区开关 × 选条目 ─────────────────────────────────────
// 「单篇 / 多篇」是这次新加的：以前只能整库出去。这里钉住四种组合，
// 免得以后改界面时把「选了却不生效」或「没选偷偷全导」带回来。
{
  const all = selectDocumentEntries(MODEL, { characters: true, events: true, countries: true, world: true })
  check('范围 · 全开时条数不变', all.total === MODEL.total, String(all.total))

  const onlyChars = selectDocumentEntries(MODEL, { characters: true, events: false, countries: false, world: false })
  check('范围 · 关掉分区只留角色', onlyChars.sections.length === 1 && onlyChars.total === 1)

  const firstId = MODEL.sections[0].entries[0].id
  const pickedOne = selectDocumentEntries(
    MODEL,
    { characters: true, events: true, countries: true, world: true },
    'picked',
    new Set([firstId]),
  )
  check('范围 · 选一条就只导一条', pickedOne.total === 1, String(pickedOne.total))
  check(
    '范围 · 选中的正是那一条',
    pickedOne.sections.flatMap((section) => section.entries).every((entry) => entry.id === firstId),
  )

  const pickedNothing = selectDocumentEntries(
    MODEL,
    { characters: true, events: true, countries: true, world: true },
    'picked',
    new Set(),
  )
  check('范围 · 选条目但没选 → 空（不偷偷退回全部）', pickedNothing.total === 0, String(pickedNothing.total))

  // 文件侧也要跟着裁：只选一条时，docx 里不该出现其它条目的标题
  const xml = buildDocumentXml(pickedOne)
  const otherTitle = MODEL.sections[1]?.entries[0]?.title
  check(
    '范围 · 只选一条时 docx 里没有别的条目',
    otherTitle === undefined || !xml.includes(otherTitle),
    otherTitle,
  )
}

if (failures.length > 0) {
  console.error('文档导出自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`文档导出自检通过：${passed} 项断言（Markdown / TXT / Word XML / 预览模型 / 分区裁剪）`)
