import { isMacOS } from './env'

/**
 * 快捷键**标签**的唯一源。
 *
 * 只换显示，不换判定：所有监听处一律同时接受 `ctrlKey` 与 `metaKey`
 *（见 `AppShell` 的 Ctrl/Cmd+S、`MenuBarSearch` 的 Ctrl/Cmd+K 等），
 * 所以 macOS 上按 ⌘ 或 Ctrl 都能触发，这里只负责把「Ctrl+Shift+Z」
 * 显示成 macOS 的「⌘⇧Z」。
 *
 * 没有做 SSR 兜底：这些标签全部出现在**打开后才渲染**的浮层里
 *（下拉 / 右键菜单），首帧 HTML 里没有它们，不存在水合不一致。
 */
const MAC_SYMBOLS: Record<string, string> = {
  ctrl: '⌘',
  cmd: '⌘',
  meta: '⌘',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
}

export function shortcutLabel(combo: string): string {
  if (!isMacOS()) return combo
  return combo
    .split('+')
    .map((part) => {
      const key = part.trim()
      return MAC_SYMBOLS[key.toLowerCase()] ?? key
    })
    .join('')
}
