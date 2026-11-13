import { describe, expect, it } from 'vitest'
import { bodyDocFromMarkdown } from '@/lib/vault/write-body'

/** 取出文档里所有文字，便于断言“标记没有被当文本留下” */
function allText(node: unknown): string {
  const n = node as { text?: string; content?: unknown[] }
  if (typeof n.text === 'string') return n.text
  return (n.content ?? []).map(allText).join('')
}

describe('bodyDocFromMarkdown（老 content 兜底）', () => {
  it('把 Markdown 的粗体解析成 bold 标记，而不是留下 ** 字面量', () => {
    const doc = bodyDocFromMarkdown('**发色：** 焦糖暖棕色。')
    const text = allText(doc)
    expect(text).toBe('发色： 焦糖暖棕色。')
    expect(JSON.stringify(doc)).toContain('"type":"bold"')
  })

  it('删除线解析成 strike', () => {
    const doc = bodyDocFromMarkdown('这是~~划掉~~的字。')
    expect(JSON.stringify(doc)).toContain('"type":"strike"')
    expect(allText(doc)).toBe('这是划掉的字。')
  })

  it('没有会话时 wiki link 降级成显示名，不留下 [[ ]] 原文', () => {
    const doc = bodyDocFromMarkdown('前缀 [[新词条|奥尼罗加德]] 后缀')
    expect(allText(doc)).toBe('前缀 奥尼罗加德 后缀')
    expect(allText(doc)).not.toContain('[[')
  })

  it('空串得到空文档而不是抛错', () => {
    expect(() => bodyDocFromMarkdown('')).not.toThrow()
  })
})
