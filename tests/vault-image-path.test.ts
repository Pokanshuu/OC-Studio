import { describe, expect, test } from 'vitest'
import { markdownToTiptap, tiptapToMarkdown } from '@/lib/vault/markdown'

function roundTrip(markdown: string) {
  const document = markdownToTiptap(markdown, { resolveLink: () => null })
  const output = tiptapToMarkdown(document, { serializeLink: () => null })
  return { document, output }
}

describe('vault Markdown image paths', () => {
  test('preserves literal CJK local paths', () => {
    const source = '![](附件/像素.png)'
    const result = roundTrip(source)
    expect(result.document.content[0]?.attrs?.src).toBe('附件/像素.png')
    expect(result.output.markdown).toBe(source)
  })

  test('preserves local paths with spaces and literal percent escapes', () => {
    const spaced = '![](<附件/带 空格.png>)'
    const literalPercent = '![](附件/字面%2520.png)'
    expect(roundTrip(spaced).output.markdown).toBe(spaced)
    expect(roundTrip(literalPercent).output.markdown).toBe(literalPercent)
  })

  test('does not decode remote URL escapes', () => {
    const source = '![](https://example.com/%E5%9B%BE.png)'
    expect(roundTrip(source).output.markdown).toBe(source)
  })
})
