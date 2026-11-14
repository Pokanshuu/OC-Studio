import { afterEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor, type JSONContent } from '@tiptap/core'

const h = vi.hoisted(() => ({ row: undefined as { id: number; document?: unknown } | undefined, content: undefined as object | string | undefined }))
vi.mock('@/lib/db', () => ({ db: {
  characters: { get: async () => h.row }, events: { get: async () => h.row },
  countries: { get: async () => h.row }, worldEntries: { get: async () => h.row },
} }))
vi.mock('@/lib/reference-sync', () => ({ syncReferenceLabels: async (value: unknown) => value }))
vi.mock('@/components/editor/EditorCore', () => ({ EditorCore: (props: { content?: object | string }) => { h.content = props.content; return null } }))

import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { buildEditorConfig } from '@/components/editor/editor-config'
import { legacyBodySections, readStoredBody } from '@/lib/body-content'
import { worldBodyOf } from '@/lib/world-body'
import { applyDocumentBodies, createLinkSerializer, documentOfEntity, serializeBody } from '@/lib/vault/markdown-bridge'
import { scanVault } from '@/lib/vault/scan'
import { markdownToTiptap, tiptapToMarkdown } from '@/lib/vault/markdown'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  h.content = undefined
})

function createEditor(content: object | string | undefined): Editor {
  return new Editor(buildEditorConfig({
    content, isMobile: true, editorId: 'body-reopen', getEditor: () => null,
    isKeyboardVisible: () => false, setEditor: () => {}, setActiveEditor: () => {}, onReady: () => {},
  }))
}

async function load(row: { id: number; document?: unknown }, fallbackContent?: object | string, entityType: 'character' | 'event' | 'country' | 'worldEntry' = 'event') {
  h.row = row
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(React.createElement(DocumentEditor, {
    entityId: 1, entityType, fallbackContent, onReady: () => {}, showToolbar: false,
  })))
  const editor = createEditor(h.content)
  try { return { text: editor.getText(), json: editor.getJSON() } } finally { editor.destroy() }
}

function hasMark(node: JSONContent, type: string): boolean {
  return (node.marks ?? []).some((mark) => mark.type === type) || (node.content ?? []).some((child) => hasMark(child, type))
}

describe('body load boundaries after reopening', () => {
  test.each(['character', 'event', 'country', 'worldEntry'] as const)('%s loads a historical Markdown document string', async (entityType) => {
    const row = { id: 1, document: '**重新打开的粗体**' }
    const before = structuredClone(row)
    const result = await load(row, undefined, entityType)
    expect(result.text).toBe('重新打开的粗体')
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(row).toEqual(before)
  })

  test('legacy event content is parsed as Markdown rather than flattened HTML text', async () => {
    const result = await load({ id: 1 }, '## 小节\n\n**粗体正文**')
    expect(result.text).not.toContain('**')
    expect(result.json.content?.some((node) => node.type === 'heading')).toBe(true)
    expect(hasMark(result.json, 'bold')).toBe(true)
  })

  test('JSON document strings are read and preferred over old fallback content', async () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '新正文' }] }] }
    const row = { id: 1, document: JSON.stringify(document), content: '旧正文' }
    expect(worldBodyOf(row)).toEqual(document)
    expect(documentOfEntity('worldEntry', row)).toEqual(document)
    expect(documentOfEntity('event', row)).toEqual(document)
    expect((await load(row)).text).toBe('新正文')
  })

  test('historical world content JSON and Markdown keep their source representation on read', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(worldBodyOf({ content: JSON.stringify(doc) })).toEqual(doc)
    expect(worldBodyOf({ document: '**新正文**', content: '旧正文' })).toBe('**新正文**')
    expect(worldBodyOf({ document: null, content: '    保留缩进代码' })).toBe('    保留缩进代码')
    expect(worldBodyOf({ document: '', content: '旧字段兜底' })).toBe('旧字段兜底')
  })

  test('valid documents containing literal Markdown examples remain literal', async () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '**字面示例** 与 ## 标题写法' }] }] }
    const result = await load({ id: 1, document: doc })
    expect(result.text).toBe('**字面示例** 与 ## 标题写法')
    expect(hasMark(result.json, 'bold')).toBe(false)
    expect(readStoredBody(doc)).toBe(doc)
  })

  test('old HTML formatting is retained', async () => {
    const result = await load({ id: 1, document: '<h2>旧标题</h2><p><strong>旧粗体</strong>与<em>斜体</em></p>' })
    expect(result.json.content?.[0]?.type).toBe('heading')
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(hasMark(result.json, 'italic')).toBe(true)
    expect(result.text).not.toContain('<strong>')
  })

  test('legacy section headings cannot force Markdown fragments onto the HTML path', async () => {
    const sections = legacyBodySections([
      { heading: '政治制度', content: '**议会制**' },
      { heading: '地理环境', content: '<p><em>北方平原</em></p>' },
    ])
    const result = await load({ id: 1 }, sections, 'country')
    expect(result.json.content?.filter((node) => node.type === 'heading')).toHaveLength(2)
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(hasMark(result.json, 'italic')).toBe(true)
    expect(result.text).not.toContain('**')
  })

  test('fenced and escaped Markdown examples stay code or text', async () => {
    const result = await load({ id: 1, document: '~~~md\n**代码示例**\n~~~\n\n\\*\\*字面示例\\*\\*' })
    expect(result.json.content?.[0]?.type).toBe('codeBlock')
    expect(result.text).toContain('**代码示例**')
    expect(result.text).toContain('**字面示例**')
    expect(hasMark(result.json, 'bold')).toBe(false)
  })

  test('HTML examples in fenced or inline code do not select the legacy HTML parser', async () => {
    const result = await load({ id: 1, document: '~~~html\n<p>**代码示例**</p>\n~~~\n\n使用 ' + String.fromCharCode(96) + '<strong>' + String.fromCharCode(96) + '，另有 **粗体正文**' })
    expect(result.json.content?.[0]?.type).toBe('codeBlock')
    expect(result.text).toContain('<p>**代码示例**</p>')
    expect(result.text).toContain('<strong>')
    expect(hasMark(result.json, 'bold')).toBe(true)
  })

  test('mixed inline HTML and Markdown preserve both styles', async () => {
    const result = await load({ id: 1, document: '**Markdown粗体** 与 <em>HTML斜体</em>' })
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(hasMark(result.json, 'italic')).toBe(true)
    expect(result.text).toBe('Markdown粗体 与 HTML斜体')
  })

  test('supported inline HTML retains unresolved wiki nodes on the Markdown path', async () => {
    const result = await load({ id: 1, document: '**粗体** 与 <small>小字</small>、<u>下划线</u>，参见 [[尚未创建#小节|别名]]' })
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(hasMark(result.json, 'small')).toBe(true)
    expect(hasMark(result.json, 'underline')).toBe(true)
    const link = result.json.content?.[0]?.content?.find((node) => node.type === 'wikiLink') as JSONContent | undefined
    expect(link?.attrs?.raw).toBe('尚未创建#小节|别名')
    expect(link?.attrs?.id).toBe('')
  })

  test('plain angle-bracket prose and indented code are not mistaken for legacy HTML', async () => {
    const result = await load({ id: 1, document: '数值 < 3，保留 **粗体**\n\n    **缩进代码**' })
    expect(result.text).toContain('数值 < 3')
    expect(hasMark(result.json, 'bold')).toBe(true)
    expect(result.json.content?.some((node) => node.type === 'codeBlock')).toBe(true)
  })

  test('unresolved legacy wiki references keep their spelling', async () => {
    const result = await load({ id: 1, document: '参见 [[尚未创建#小节|名字]]' })
    const node = result.json.content?.[0]?.content?.find((item) => item.type === 'wikiLink')
    expect((node as JSONContent | undefined)?.attrs?.raw).toBe('尚未创建#小节|名字')
  })

  test('repeated serialize, fresh scan and actual editor loads retain formatting', () => {
    let value: object | string = '## 章节\n\n**粗体** 与 *斜体*\n\n- 列表一\n- 列表二'
    for (let cycle = 0; cycle < 4; cycle++) {
      const editor = createEditor(value)
      const doc = editor.getJSON()
      editor.destroy()
      expect(hasMark(doc, 'bold')).toBe(true)
      expect(hasMark(doc, 'italic')).toBe(true)
      expect(doc.content?.some((node) => node.type === 'bulletList')).toBe(true)
      const body = serializeBody('worldEntry', { document: doc }, createLinkSerializer(() => undefined))
      expect(body?.hasFallback).toBe(false)
      const source = '---\ntitle: 回读测试\n---\n\n' + body?.markdown
      const scan = scanVault({ root: 'memory-reopen', files: [{ relPath: '世界观/回读测试.md', content: source, mtimeMs: cycle + 1, size: source.length }], skippedDirs: [], marker: null })
      applyDocumentBodies(scan)
      value = worldBodyOf(scan.dataset.worldEntries[0].entity)
    }
  })

  test.each([
    ['中文引号', '“引号里的粗体”'],
    ['标点相邻', '（括号、标点。）'],
    ['字面星号', '**这也是内容**'],
    ['Markdown符号', '# [] () ~~'],
  ])('rich text %s survives four fresh file loads', (_label, text) => {
    let value: object | string = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '中文前缀' },
      { type: 'text', text, marks: [{ type: 'bold' }] },
      { type: 'text', text: '中文后缀' },
    ] }] }
    for (let cycle = 0; cycle < 4; cycle++) {
      const editor = createEditor(value)
      const doc = editor.getJSON()
      expect(editor.getText()).toBe('中文前缀' + text + '中文后缀')
      expect(hasMark(doc, 'bold')).toBe(true)
      editor.destroy()
      const body = serializeBody('worldEntry', { document: doc }, createLinkSerializer(() => undefined))
      expect(body?.hasFallback).toBe(true)
      const source = '---\ntitle: 富文本回读\n---\n\n' + body?.markdown
      const scan = scanVault({ root: 'memory-reopen', files: [{ relPath: '世界观/富文本回读.md', content: source, mtimeMs: cycle + 1, size: source.length }], skippedDirs: [], marker: null })
      applyDocumentBodies(scan)
      value = worldBodyOf(scan.dataset.worldEntries[0].entity)
    }
  })

  test.each(['underline', 'small'])('%s uses the actual editor mark name after saving and reopening', (mark) => {
    let value: object | string = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '前缀' }, { type: 'text', text: '保留格式', marks: [{ type: mark }] }, { type: 'text', text: '后缀' },
    ] }] }
    for (let cycle = 0; cycle < 4; cycle++) {
      const editor = createEditor(value)
      const doc = editor.getJSON()
      expect(editor.getText()).toBe('前缀保留格式后缀')
      expect(hasMark(doc, mark)).toBe(true)
      editor.destroy()
      const body = serializeBody('worldEntry', { document: doc }, createLinkSerializer(() => undefined))
      expect(body?.hasFallback).toBe(false)
      const source = '---\ntitle: 行内格式\n---\n\n' + body?.markdown
      const scan = scanVault({ root: 'memory-reopen', files: [{ relPath: '世界观/行内格式.md', content: source, mtimeMs: cycle + 1, size: source.length }], skippedDirs: [], marker: null })
      applyDocumentBodies(scan)
      value = worldBodyOf(scan.dataset.worldEntries[0].entity)
    }
  })
})

describe('fallback formatting and reference identity', () => {
  const punctuated: JSONContent = { type: 'paragraph', content: [
    { type: 'text', text: '前缀' },
    { type: 'text', text: '“局部粗体”', marks: [{ type: 'bold' }] },
    { type: 'text', text: '后缀' },
  ] }

  function rescan(markdown: string, files: Array<{ relPath: string; content: string }> = []) {
    const scan = scanVault({ root: 'memory-reopen', files: [
      ...files, { relPath: '世界观/回读笔记.md', content: '---\ntitle: 回读笔记\n---\n\n' + markdown },
    ].map((file) => ({ ...file, mtimeMs: 1, size: file.content.length })), skippedDirs: [], marker: null })
    applyDocumentBodies(scan)
    return scan
  }

  test.each(['character', 'worldEntry'] as const)('%s references in a fallback follow filenames after IDs change', (kind) => {
    const node: JSONContent = { type: kind === 'character' ? 'mention' : 'wikiLink', attrs: {
      id: '1', label: '显示别名', ...(kind === 'character' ? { entityType: kind } : {}), anchor: '小节',
    }, marks: [{ type: 'italic' }] }
    const doc = { type: 'doc', content: [punctuated, { type: 'paragraph', content: [node] }] }
    const before = structuredClone(doc)
    const serialized = tiptapToMarkdown(doc, { serializeLink: createLinkSerializer(() => '目标', () => '02.目标') })
    expect(serialized.hasFallback).toBe(true)
    expect(doc).toEqual(before)
    const folder = kind === 'character' ? '角色' : '世界观'
    const nameKey = kind === 'character' ? 'name' : 'title'
    const scan = rescan(serialized.markdown, [
      { relPath: folder + '/01.其他.md', content: '---\n' + nameKey + ': 其他\n---\n' },
      { relPath: folder + '/02.目标.md', content: '---\n' + nameKey + ': 目标\n---\n' },
    ])
    const targets = kind === 'character' ? scan.dataset.characters : scan.dataset.worldEntries
    const target = targets.find((item) => item.relPath.endsWith('/02.目标.md'))
    expect(target?.entity.id).not.toBe(1)
    const restored = scan.dataset.worldEntries.find((item) => item.relPath.endsWith('/回读笔记.md'))?.entity.document as JSONContent
    const reference = restored.content?.[1]?.content?.[0]
    expect(reference?.type).toBe(node.type)
    expect(reference?.attrs?.id).toBe(String(target?.entity.id))
    expect(reference?.attrs?.raw).toBe('02.目标#小节|显示别名')
    expect(reference?.attrs?.label).toBe('显示别名')
    expect(hasMark(restored, 'bold')).toBe(true)
    expect(hasMark(reference ?? {}, 'italic')).toBe(true)
  })

  test('deliberately unlinked references stay text when other content needs a fallback', () => {
    const doc = { type: 'doc', content: [punctuated, { type: 'paragraph', content: [
      { type: 'mention', attrs: { id: '', entityType: 'character', label: '同名角色' }, marks: [{ type: 'bold' }] },
    ] }] }
    const serialized = tiptapToMarkdown(doc, { serializeLink: createLinkSerializer(() => undefined) })
    const scan = rescan(serialized.markdown, [{ relPath: '角色/同名角色.md', content: '---\nname: 同名角色\n---\n' }])
    const restored = scan.dataset.worldEntries[0].entity.document as JSONContent
    expect(restored.content?.[1]?.content).toEqual([{ type: 'text', text: '同名角色', marks: [{ type: 'bold' }] }])
  })

  test('legacy fallback raw references rebind while unknown blocks remain intact', () => {
    const doc = { type: 'doc', content: [
      { type: 'mysteryBlock', attrs: { keep: true } },
      { type: 'paragraph', content: [{ type: 'mention', attrs: { id: '1', label: '旧别名', entityType: 'character', raw: '02.目标|旧别名' } }] },
    ] }
    const fence = String.fromCharCode(96).repeat(3)
    const scan = rescan(fence + 'oc-document\n' + JSON.stringify(doc) + '\n' + fence, [
      { relPath: '角色/01.其他.md', content: '---\nname: 其他\n---\n' },
      { relPath: '角色/02.目标.md', content: '---\nname: 目标\n---\n' },
    ])
    const restored = scan.dataset.worldEntries[0].entity.document as JSONContent
    expect(restored.content?.[0]).toEqual(doc.content[0])
    expect(restored.content?.[1]?.content?.[0]?.attrs?.id).toBe('2')
  })

  test('legacy fallback IDs without filenames never bind to another entity by ID or label', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'mention', attrs: { id: '1', label: '同名角色', entityType: 'character' }, marks: [{ type: 'italic' }] },
    ] }] }
    const fence = String.fromCharCode(96).repeat(3)
    const scan = rescan(fence + 'oc-document\n' + JSON.stringify(doc) + '\n' + fence, [
      { relPath: '角色/同名角色.md', content: '---\nname: 同名角色\n---\n' },
    ])
    const restored = scan.dataset.worldEntries[0].entity.document as JSONContent
    expect(restored.content?.[0]?.content).toEqual([{ type: 'text', text: '同名角色', marks: [{ type: 'italic' }] }])
  })

  test('a missing fallback target keeps its label and formatting without a stale ID', () => {
    const doc = { type: 'doc', content: [punctuated, { type: 'paragraph', content: [
      { type: 'wikiLink', attrs: { id: '1', label: '原来的条目', raw: '已移除|原来的条目' }, marks: [{ type: 'bold' }] },
    ] }] }
    const serialized = tiptapToMarkdown(doc, { serializeLink: () => null })
    const restored = markdownToTiptap(serialized.markdown, { resolveLink: () => null })
    expect(restored.content[1]?.content).toEqual([{ type: 'text', text: '原来的条目', marks: [{ type: 'bold' }] }])
  })

  test('a fallback takes precedence over HTML in the readable Markdown preview', async () => {
    const doc = { type: 'doc', content: [punctuated, { type: 'paragraph', content: [
      { type: 'text', text: '下划线', marks: [{ type: 'underline' }] },
    ] }] }
    const serialized = tiptapToMarkdown(doc, { serializeLink: () => null })
    expect(serialized.hasFallback).toBe(true)
    const restored = await load({ id: 1, document: serialized.markdown })
    expect(restored.text).toBe('前缀“局部粗体”后缀\n\n下划线')
    expect(hasMark(restored.json, 'bold')).toBe(true)
    expect(hasMark(restored.json, 'underline')).toBe(true)
    expect(restored.text).not.toContain('oc-document')
  })
})
