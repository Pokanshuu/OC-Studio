import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .trim()
}

export function extractText(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return stripHtml(content)
  if (typeof content === 'object' && content !== null) {
    const record = content as Record<string, unknown>
    if (record.type === 'doc' && Array.isArray(record.content)) {
      return (record.content as Array<Record<string, unknown>>)
        .map((node) => extractTextNode(node))
        .filter(Boolean)
        .join('\n')
    }
  }
  return ''
}

function extractTextNode(node: Record<string, unknown>): string {
  if (!node) return ''
  if (node.type === 'text') return (node.text as string) || ''
  if (node.type === 'hardBreak') return '\n'
  if (Array.isArray(node.content)) {
    return (node.content as Array<Record<string, unknown>>)
      .map((child) => extractTextNode(child))
      .join('')
  }
  return ''
}
