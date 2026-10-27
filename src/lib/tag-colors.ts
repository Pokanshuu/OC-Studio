/**
 * 标签预设色板 —— 唯一源。
 * `Tag.color` 存十六进制字符串；展示侧的「色值 → 类名」映射在
 * `features/tags/components/TagBadge.tsx`（必须是完整字面量类名，
 * Tailwind JIT 按源码文本扫描，不做动态拼接）。
 */
export const TAG_PRESET_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
] as const

/** 按名字稳定地取一个预设色（导入 vault 时为没有颜色的标签分配） */
export function pickTagColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return TAG_PRESET_COLORS[Math.abs(hash) % TAG_PRESET_COLORS.length]
}

/** 收敛非法色值（导入的 vault 可能带来任意字符串） */
export function normalizeTagColor(value: unknown, name: string): string {
  if (typeof value === 'string' && (TAG_PRESET_COLORS as readonly string[]).includes(value)) {
    return value
  }
  return pickTagColor(name)
}

