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

/**
 * 是不是应用自己的元数据目录（`.ocstudio` / `.trash` 这类顶层点目录）。
 *
 * 这类目录**永远不参与条目落点推断**：它不是作者整理出来的分类目录，
 * 跟着它走会把新条目写进 `.ocstudio/`（界面上看起来就是「文件凭空消失」）。
 */
export function isInternalFolder(folder: string): boolean {
  const top = normalizeRelPath(folder).split('/')[0]
  return top !== '' && top.startsWith('.')
}

/**
 * 相对路径是不是落在这个库的内部目录里（`.ocstudio/…`、`.trash/…` 这类）。
 *
 * 和 `isInternalFolder` 的分工：那个看的是「目录」，这个看的是「文件路径」。
 * 新建条目的候选目录推断必须同时挡住两种：回收站里的条目（`trashed`）、
 * 已经写错的内部路径（`.ocstudio/新书.md`）都不能再参与投票，否则错误会自我延续。
 */
export function isInternalRelPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath)
  if (normalized === '') return false
  const slash = normalized.indexOf('/')
  const top = slash === -1 ? normalized : normalized.slice(0, slash)
  return top.startsWith('.')
}

/**
 * 某类型「活着的」笔记所在目录 —— 给新文件挑落点用。
 *
 * 直接遍历会话索引会踩两个坑，两个都真的发生过：
 *  1. **回收站条目还在索引里**，`relPath` 已经变成 `.ocstudio/trash/<批次>/国家/x.md`。
 *     一个国家都不剩、只剩回收站里的国家时，顶层投票会投给 `.ocstudio` ——
 *     新建的国家于是落到 `.ocstudio/` 根下，`国家/` 却是空的。
 *  2. 一旦有文件被写到 `.ocstudio/`（上一条的后果，或手工挪错），它会**继续投票**，
 *     把后面每一条新建都拖进同一个错误目录（自我延续）。
 *
 * 所以判据是「活着的 + 没被软删除 + 不在内部目录里」，而不是「索引里有没有这条路」。
 *
 * `entity.deleted` 只有会话条目带；纯函数调用方（脚本里的字面量）可以不给。
 */
export function foldersOfKind(
  entries: Iterable<{ kind: string; relPath: string; trashed: boolean; entity?: unknown }>,
  kind: string,
): string[] {
  const folders: string[] = []
  for (const entry of entries) {
    if (entry.kind !== kind || entry.trashed) continue
    const deleted = (entry.entity as { deleted?: unknown } | null | undefined)?.deleted
    if (deleted === true) continue
    const relPath = normalizeRelPath(entry.relPath)
    if (relPath === '' || isInternalRelPath(relPath)) continue
    const slash = relPath.lastIndexOf('/')
    if (slash <= 0) continue
    const folder = relPath.slice(0, slash)
    if (isInternalFolder(folder)) continue
    folders.push(folder)
  }
  return folders
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
  // 内部目录（`.ocstudio/…`）在这里再挡一道：调用方可能直接把索引里的路径递进来
  const folders = existingFolders
    .map(normalizeRelPath)
    .filter((folder) => folder !== '' && !isInternalFolder(folder))

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
 * 比较用的路径键：Windows 与 macOS（默认 APFS）文件系统大小写不敏感，
 * `世界观/测试.md` 与 `世界观/测试.MD` 是**同一个文件**。
 * 分配新路径时只按字节比较会在这些平台上静默覆盖一条已有笔记。
 */
function pathKey(relPath: string): string {
  return normalizeRelPath(relPath).toLowerCase()
}

export function isRelPathOccupied(occupied: ReadonlySet<string>, relPath: string): boolean {
  const key = pathKey(relPath)
  for (const path of occupied) {
    if (pathKey(path) === key) return true
  }
  return false
}

/**
 * 分配一个未被占用的 vault 相对路径。
 * @param occupied 已占用的路径集合（含被忽略的非实体文件），避免撞名
 * @param fileName 文件名（不含扩展名）；缺省 = 标题（小说章节用它加「第 01 章-」前缀）
 *
 * 同一批次里的多次调用必须**每次分配后立刻把结果加进 occupied**，
 * 否则两个新条目会拿到同一个路径，后写覆盖先写（F01）。
 */
export function allocateRelPath(
  kind: VaultStorableKind,
  title: string,
  occupied: ReadonlySet<string>,
  folder?: string,
  fileName?: string,
): string {
  const dir = normalizeRelPath(folder ?? DEFAULT_FOLDER[kind])
  const base = sanitizeFileName(fileName ?? title)
  const build = (suffix: string): string =>
    dir === '' ? `${base}${suffix}.md` : `${dir}/${base}${suffix}.md`

  // 先拍一份小写键：集合可能包含整个库的文件（上千条），每次分配 O(n) 可接受，
  // 但不应在每个候选后缀上重复构造。
  const taken = new Set<string>()
  for (const path of occupied) taken.add(pathKey(path))

  let candidate = build('')
  let counter = 2
  while (taken.has(pathKey(candidate))) {
    candidate = build(` (${counter})`)
    counter += 1
  }
  return candidate
}

/** 章节文件名：`第03章-标题`；标题自己已经写了「第 N 章」就不重复加 */
export function novelChapterFileTitle(title: string, chapterNumber: number): string {
  if (/^第\s*\d+\s*章/.test(title.trim())) return title
  return `第${String(Math.max(1, chapterNumber)).padStart(2, '0')}章-${title}`
}

/**
 * 回收站的批次目录名：`YYYYMMDD-HHmmss`。
 *
 * 一次删除 = 一个批次目录。**没有它就会撞车**：`新地图 3.md` 删过一次之后
 * `trash/世界观/新地图 3.md` 就在那儿了，同名文件再删一次 `move` 会直接失败
 * （界面上就是一条「目标已存在: .ocstudio/trash/…」的报错，而且那张图明明已经删了）。
 */
export function trashBatchId(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

/** 回收站里的相对路径：`.ocstudio/trash/<批次>/<原路径>` */
export function trashRelPath(relPath: string, batch = trashBatchId()): string {
  return `.ocstudio/trash/${batch}/${normalizeRelPath(relPath)}`
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

/**
 * 从回收站路径还原回原路径；不是回收站路径时返回 null。
 *
 * 兼容两种形状：新的是 `.ocstudio/trash/<批次>/<原路径>`（批次段要剥掉），
 * 老的是 `.ocstudio/trash/<原路径>`。判据是「第一段长得像不像批次号」——
 * 不像就整段当原路径，老回收站里的东西照样还原得回去。
 */
export function originalRelPathFromTrash(relPath: string): string | null {
  const normalized = normalizeRelPath(relPath)
  const prefix = '.ocstudio/trash/'
  if (!normalized.startsWith(prefix)) return null

  let rest = normalized.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash > 0 && /^\d{8}-\d{6}$/.test(rest.slice(0, slash))) rest = rest.slice(slash + 1)
  return rest === '' ? null : rest
}
