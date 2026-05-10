function extractText(node: Record<string, unknown>): string {
  if (node.type === 'text') return (node.text as string) ?? ''
  if (node.type === 'mention') return `@${(node.attrs as Record<string, string> | undefined)?.label ?? ''}`
  const content = node.content
  if (Array.isArray(content)) {
    return content.map((child) => extractText(child as Record<string, unknown>)).join('')
  }
  return ''
}

export function extractCountryPreview(document: unknown): string | null {
  const doc = document as Record<string, unknown> | null | undefined
  if (!doc || !Array.isArray(doc.content)) return null

  const blocks = doc.content as Array<Record<string, unknown>>

  for (const block of blocks) {
    if (block.type === 'heading') continue
    if (block.type === 'paragraph') {
      const text = extractText(block).trim()
      if (text) {
        return text.length > 50 ? text.slice(0, 50) : text
      }
    }
  }

  return null
}
