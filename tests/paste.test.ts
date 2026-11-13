import { describe, expect, it } from 'vitest'
import {
  clipboardHasReadableText,
  clipboardImageFiles,
  looksLikeMarkdown,
  markdownToPastedHtml,
  plainTextToPastedHtml,
  sanitizePastedHtml,
} from '@/components/editor/paste'

/** 造一个只实现「读文本」的剪贴板对象，避免依赖真实 ClipboardEvent */
function clipboard(data: { html?: string; text?: string; files?: File[] }): DataTransfer {
  const files = data.files ?? []
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    getData: (type: string) => {
      if (type === 'text/html') return data.html ?? ''
      if (type === 'text/plain') return data.text ?? ''
      return ''
    },
  } as unknown as DataTransfer
}

function imageFile(name = 'photo.png'): File {
  return new File(['x'], name, { type: 'image/png' })
}

describe('sanitizePastedHtml', () => {
  it('丢掉脚本、样式与事件属性', () => {
    const html = '<p onclick="steal()">正文</p><script>alert(1)</script><style>p{}</style>'
    const clean = sanitizePastedHtml(html)
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('style')
    expect(clean).not.toContain('onclick')
    expect(clean).toContain('正文')
  })

  it('保留标题、列表、表格、链接、图片', () => {
    const html = [
      '<h2>标题</h2>',
      '<ul><li>甲</li><li>乙</li></ul>',
      '<table><tbody><tr><th>列</th></tr><tr><td colspan="2">值</td></tr></tbody></table>',
      '<p><a href="https://example.com/a">链接</a></p>',
      '<p><img src="https://example.com/a.png" alt="图"></p>',
    ].join('')
    const clean = sanitizePastedHtml(html)
    expect(clean).toContain('<h2>标题</h2>')
    expect(clean).toContain('<ul><li>甲</li><li>乙</li></ul>')
    expect(clean).toContain('colspan="2"')
    expect(clean).toContain('href="https://example.com/a"')
    expect(clean).toContain('src="https://example.com/a.png"')
    expect(clean).toContain('alt="图"')
  })

  it('拆掉无意义 span 与内联样式，但把 style 里的加粗 / 斜体还原成语义标签', () => {
    const clean = sanitizePastedHtml(
      '<p><span style="font-weight: 700; color: red">粗</span><span style="font-style: italic">斜</span><span>普通</span></p>',
    )
    expect(clean).not.toContain('span')
    expect(clean).not.toContain('style')
    expect(clean).toContain('<strong>粗</strong>')
    expect(clean).toContain('<em>斜</em>')
    expect(clean).toContain('普通')
  })

  it('保留站内提及的 data-* 身份', () => {
    const clean = sanitizePastedHtml(
      '<p><span data-type="mention" data-id="7" data-label="艾拉" data-entity-type="character">@艾拉</span></p>',
    )
    expect(clean).toContain('data-type="mention"')
    expect(clean).toContain('data-id="7"')
    expect(clean).toContain('@艾拉')
  })

  it('不安全链接拆壳留文字，data: 图片整个丢掉', () => {
    const clean = sanitizePastedHtml(
      '<p><a href="javascript:alert(1)">点我</a><img src="data:image/png;base64,AAA"></p>',
    )
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('data:image')
    expect(clean).toContain('点我')
  })

  it('Word 的命名空间标签拆壳留内容', () => {
    const clean = sanitizePastedHtml('<p><o:p>段落</o:p></p>')
    expect(clean).toContain('段落')
    expect(clean).not.toContain('o:p')
  })

  it('幂等：清洗两次等于清洗一次', () => {
    const html = '<p><span style="font-weight:bold">粗</span> 与 <a href="/x">链</a></p>'
    const once = sanitizePastedHtml(html)
    expect(sanitizePastedHtml(once)).toBe(once)
  })

  it('空字符串返回空', () => {
    expect(sanitizePastedHtml('   ')).toBe('')
  })
})

describe('looksLikeMarkdown', () => {
  it('标题 / 围栏 / 引用 / 表格任一条即判定', () => {
    expect(looksLikeMarkdown('# 标题')).toBe(true)
    expect(looksLikeMarkdown('```ts\nconst a = 1\n```')).toBe(true)
    expect(looksLikeMarkdown('> 引用')).toBe(true)
    expect(looksLikeMarkdown('| 甲 | 乙 |\n| --- | --- |')).toBe(true)
  })

  it('两行列表算结构，单独一行不算', () => {
    expect(looksLikeMarkdown('- 甲\n- 乙')).toBe(true)
    expect(looksLikeMarkdown('1. 甲\n2. 乙')).toBe(true)
    expect(looksLikeMarkdown('- 这不是列表，是一句话')).toBe(false)
  })

  it('普通多段文字不算 Markdown', () => {
    expect(looksLikeMarkdown('第一段。\n\n第二段。')).toBe(false)
  })
})

describe('plainTextToPastedHtml', () => {
  it('Markdown 转成结构', () => {
    const html = plainTextToPastedHtml('## 小节\n\n- 甲\n- 乙') ?? ''
    expect(html).toContain('<h2>小节</h2>')
    expect(html).toContain('<li>甲</li>')
  })

  it('多段纯文本按空行拆段，段内换行变 <br>', () => {
    const html = plainTextToPastedHtml('第一段\n同一段第二行\n\n第二段') ?? ''
    expect(html).toBe('<p>第一段<br>同一段第二行</p><p>第二段</p>')
  })

  it('单段纯文本返回 null，交给默认插入', () => {
    expect(plainTextToPastedHtml('只有一行')).toBeNull()
  })

  it('空白返回 null', () => {
    expect(plainTextToPastedHtml('   \n  ')).toBeNull()
  })

  it('转义 HTML 特殊字符', () => {
    const html = plainTextToPastedHtml('<b>不是标签</b>\n\n第二段') ?? ''
    expect(html).toContain('&lt;b&gt;不是标签&lt;/b&gt;')
  })
})

describe('markdownToPastedHtml', () => {
  it('Markdown 里的 HTML 被转义（不执行），结构标签照常生成', () => {
    const html = markdownToPastedHtml('<script>alert(1)</script>\n\n**粗**')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<strong>粗</strong>')
  })
})

describe('clipboardHasReadableText', () => {
  it('有文字的 HTML 算可读', () => {
    expect(clipboardHasReadableText(clipboard({ html: '<p>正文</p>' }))).toBe(true)
  })

  it('只有图片地址的 HTML 也算可读（图片要保留）', () => {
    expect(clipboardHasReadableText(clipboard({ html: '<img src="https://example.com/a.png">' }))).toBe(true)
  })

  it('只有文件名时不算可读（走图片路径）', () => {
    expect(clipboardHasReadableText(clipboard({ text: 'photo.png', files: [imageFile()] }))).toBe(false)
  })

  it('图片文件旁的真文字算可读（文字优先）', () => {
    expect(clipboardHasReadableText(clipboard({ text: '图注文字', files: [imageFile()] }))).toBe(true)
  })

  it('空剪贴板不算可读', () => {
    expect(clipboardHasReadableText(clipboard({}))).toBe(false)
    expect(clipboardHasReadableText(null)).toBe(false)
  })
})

describe('clipboardImageFiles', () => {
  it('只收图片类型的文件', () => {
    const png = imageFile()
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    const files = clipboardImageFiles(clipboard({ files: [png, pdf] }))
    expect(files.map((file) => file.name)).toEqual(['photo.png'])
  })

  it('没有文件返回空数组', () => {
    expect(clipboardImageFiles(clipboard({ text: '文字' }))).toEqual([])
    expect(clipboardImageFiles(null)).toEqual([])
  })
})
