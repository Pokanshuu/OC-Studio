import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * 字号五档（`--text-micro` 等，见 globals.css）生成的是 `text-micro` / `text-caption` /
 * `text-ui` / `text-body` / `text-reading`。tailwind-merge 3.5 只认识 `text-xs/sm/base`，
 * 认不出这些自定义档，会把它们当成 `text-color`（和 `text-ink` 同一组）整条丢掉。
 * 丢掉之后元素没有字号，掉回浏览器默认 16px —— 菜单、按钮都比原来大一圈。
 * 所以这里显式登记它们属于字号，不和颜色冲突。
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "ui", "body", "reading"],
    },
  },
})

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
