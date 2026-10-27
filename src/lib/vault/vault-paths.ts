import type { VaultStorableKind } from './types'

// ── vault 内路径分配（纯函数） ───────────────────────────────────────────
// 新建实体时要决定它落到哪个目录、叫什么文件名。规则刻意保守：
// **优先沿用该类型已有的目录**，只有全新 vault 才用约定目录名。
// 这样不会把用户自己整理好的 `20.角色/<国家>/` 结构推倒重来。

/** 该类型没有既有目录时使用的约定目录名 */
export const DEFAULT_FOLDER: Record<VaultStorableKind, string> = {
  character: '角色',
  country: '国家',
  event: '事件',
  worldEntry: '世界观',
  tag: '标签',
  period: '时期',
}

/** Windows 保留设备名（不能作为文件名） */
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

const MAX_NAME_LENGTH = 80

/** 路径归一：统一正斜杠、去掉首尾斜杠 */
export function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** 展示名 → 合法文件名（去扩展名）。Windows 与 Obsidian 的限制都照顾到 */
export function sanitizeFileName(title: string): string {
  let name = title
    // Windows 非法字符（Obsidian 也不允许，其中 [ ] # ^ | 会被 Obsidian 额外禁用）
    .replace(/[\\/:*?"<>|[\]^#]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    // 首尾的点和空格：Windows 不允许文件名以它们结尾
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')

  if (name.length > MAX_NAME_LENGTH) {
    name = name.slice(0, MAX_NAME_LENGTH).replace(/[.\s]+$/, '')
  }
  if (name === '') name = '未命名'
  if (RESERVED_NAMES.has(name.toUpperCase())) name = `_${name}`
  return name
}

/**
 * 选新文件的目录。
 * @param existingFolders 同类型既有笔记所在的目录（相对路径，可含多级）
 * @param hint 细分提示（如角色的所属国家名）—— 已有对应子目录时优先用它
 */
export function pickPreferredFolder(
  kind: VaultStorableKind,
  existingFolders: string[],
  hint?: string,
): string {
  const folders = existingFolders
    .map(normalizeRelPath)
    .filter((folder) => folder !== '')

  if (folders.length === 0) return DEFAULT_FOLDER[kind]

  // 按顶层目录投票，取最高票 —— 保住用户自己的编号前缀（如 `20.角色`）
  const topVotes = new Map<string, number>()
  for (const folder of folders) {
    const top = folder.split('/')[0]
    topVotes.set(top, (topVotes.get(top) ?? 0) + 1)
  }
  let top = ''
  let best = -1
  for (const [name, votes] of topVotes) {
    if (votes > best) {
      top = name
      best = votes
    }
  }

  if (hint !== undefined && hint.trim() !== '') {
    const wanted = hint.trim()
    // 精确匹配某个已有目录的最后一段（`20.角色/<国家>` 末段是「<国家>」）
    const match = folders.find((folder) => {
      const segments = folder.split('/')
      return segments[segments.length - 1] === wanted
    })
    if (match !== undefined) return match
    // 退一步：顶层下正好有一个同名子目录（用既有命名风格拼）
    const nested = `${top}/${wanted}`
    if (folders.some((folder) => folder === nested)) return nested
  }

  return top
}

/**
 * 分配一个未被占用的 vault 相对路径。
 * @param occupied 已占用的路径集合（含被忽略的非实体文件），避免撞名
 */
export function allocateRelPath(
  kind: VaultStorableKind,
  title: string,
  occupied: ReadonlySet<string>,
  folder?: string,
): string {
  const dir = normalizeRelPath(folder ?? DEFAULT_FOLDER[kind])
  const base = sanitizeFileName(title)
  const build = (suffix: string): string =>
    dir === '' ? `${base}${suffix}.md` : `${dir}/${base}${suffix}.md`

  let candidate = build('')
  let counter = 2
  while (occupied.has(candidate)) {
    candidate = build(` (${counter})`)
    counter += 1
  }
  return candidate
}

/** 回收站里的相对路径：`.ocstudio/trash/<原路径>` */
export function trashRelPath(relPath: string): string {
  return `.ocstudio/trash/${normalizeRelPath(relPath)}`
}

/** 素材目录的识别关键词（中英兼顾） */
const ASSET_KEYWORDS = ['附件', '素材', '图片', '资源', 'attachments', 'assets', 'images', 'media', 'files']

/**
 * 从既有目录里挑一个素材目录。
 * 优先带编号前缀的（`99.附件`）—— 编号是这类 vault 的排序约定，
 * 直接沿用用户已有的目录，比新建一个 `附件/` 更尊重他的结构。
 * 都没命中就返回默认名（首次上传时才创建）。
 */
export function pickAssetsDir(dirs: string[]): string {
  const top = dirs.map(normalizeRelPath).filter((dir) => dir !== '' && !dir.includes('/'))
  const candidates = top.filter((dir) =>
    ASSET_KEYWORDS.some((keyword) => dir.toLowerCase().includes(keyword.toLowerCase())),
  )
  if (candidates.length === 0) return DEFAULT_ASSETS_DIR

  const numbered = candidates.filter((dir) => /^\d+[.、_\-]/.test(dir)).sort()
  return numbered[0] ?? candidates[0]
}

export const DEFAULT_ASSETS_DIR = '附件'

/** 从回收站路径还原回原路径；不是回收站路径时返回 null */
export function originalRelPathFromTrash(relPath: string): string | null {
  const normalized = normalizeRelPath(relPath)
  const prefix = '.ocstudio/trash/'
  if (!normalized.startsWith(prefix)) return null
  const rest = normalized.slice(prefix.length)
  return rest === '' ? null : rest
}
