/**
 * 链接地址白名单（移植自 Simple_Office 的 `safeHref`，按 OC 的场景收窄）。
 *
 * 允许：http(s) / mailto / tel、站内锚点 `#...`、协议相对 `//...`（补 https）、
 * 不含反斜杠/控制字符的相对路径。拒绝 `javascript:`、`data:` 等其它协议。
 *
 * 注意：Tauri 的 `open_external` 只放行 http(s)；mailto/tel 在点击处交给系统处理。
 */

const ALLOWED_PROTOCOL = /^(https?:|mailto:|tel:)/i
const ANY_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i
const UNSAFE_CHARS = /[\\\u0000-\u001F\u007F]/

export function safeHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  if (value.startsWith('#')) return value
  if (value.startsWith('//')) return `https:${value}`
  if (ALLOWED_PROTOCOL.test(value)) return value
  if (ANY_PROTOCOL.test(value)) return null
  if (UNSAFE_CHARS.test(value)) return null
  return value
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}
