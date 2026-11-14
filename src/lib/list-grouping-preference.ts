/**
 * 列表分组方式的本地 UI 偏好（角色编辑器左栏：按国家 / 按文件夹）。
 *
 * - 只在 localStorage；**不进笔记、不进备份、不改 schema**，不记任何实体 id
 * - 坏值 / 无 localStorage / 存储被禁用：安全回落到默认（按国家）
 */
export type CharacterGroupMode = 'country' | 'folder'

const CHARACTER_GROUP_MODE_KEY = 'oc-character-group-mode'

export const CHARACTER_GROUP_MODES: readonly CharacterGroupMode[] = ['country', 'folder']

/** localStorage 键（测试与调试用） */
export const CHARACTER_GROUP_MODE_STORAGE_KEY = CHARACTER_GROUP_MODE_KEY

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 存不下就算了：偏好不是数据，下一次打开回到默认即可
  }
}

function readMode<T extends string>(key: string, options: readonly T[], fallback: T): T {
  const saved = readStored(key)
  return options.find((option) => option === saved) ?? fallback
}

export function readCharacterGroupMode(): CharacterGroupMode {
  return readMode(CHARACTER_GROUP_MODE_KEY, CHARACTER_GROUP_MODES, 'country')
}

export function writeCharacterGroupMode(mode: CharacterGroupMode): void {
  writeStored(CHARACTER_GROUP_MODE_KEY, mode)
}
