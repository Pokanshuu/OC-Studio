/**
 * 「按 X 分组」的纯逻辑 —— 角色左栏与自定义分类列表共用。
 *
 * 三条规矩：
 * 1. **分组只改展示**：这里只读条目与文件夹清单，不写回任何实体、不碰文件。
 * 2. **一条都不能丢**：`keyOf` 落在已知分组之外时，先试 `unknownGroup`（文件夹清单漏记
 *    了某个名字也要显示），再落兜底组；实在没有兜底才现建一组，绝不静默吞掉。
 * 3. **折叠键带命名空间**：`country:12` / `folder:甲` / `unassigned:country` /
 *    `unassigned:folder`。真实文件夹恰好叫「未分组」时，它的键是 `folder:未分组`，
 *    与兜底组的 `unassigned:folder` 不同 —— 折叠状态不会串。
 *
 * 角色只提供数据适配（见 `features/characters/grouping.ts`），共享的只有这里的纯函数
 * 与两个小 UI 件（`GroupModeMenu` / `ListGroupSection`）。
 */

export interface ListGroup<T> {
  /** 命名空间化的折叠键（见文件头） */
  key: string
  label: string
  items: T[]
}

export interface GroupDefinition {
  key: string
  label: string
}

/** 分组键前缀：两个前缀互不为前缀，键天然不撞 */
export const COUNTRY_GROUP_PREFIX = 'country:'
export const FOLDER_GROUP_PREFIX = 'folder:'

/** 兜底组：没有国家归属 / 没有文件夹 */
export const UNASSIGNED_COUNTRY_KEY = 'unassigned:country'
export const UNASSIGNED_FOLDER_KEY = 'unassigned:folder'
export const UNASSIGNED_COUNTRY_LABEL = '未归属'
export const UNASSIGNED_FOLDER_LABEL = '未分组'

export function countryGroupKey(id: number): string {
  return `${COUNTRY_GROUP_PREFIX}${id}`
}

export function folderGroupKey(name: string): string {
  return `${FOLDER_GROUP_PREFIX}${name}`
}

export interface GroupItemsOptions<T> {
  /** 已经搜索过滤、排好序的条目（组内顺序原样保留） */
  items: readonly T[]
  /** 归属键；`null` = 兜底组 */
  keyOf: (item: T) => string | null
  /** 已知分组（顺序即展示顺序，可含零成员组） */
  known?: readonly GroupDefinition[]
  /** 兜底组；`null` 表示没有兜底组 */
  fallback?: GroupDefinition | null
  /** 不在 known 里的键：现建一组（文件夹清单漏记时用）；返回 null 则落兜底 */
  unknownGroup?: (key: string) => GroupDefinition | null
  /** 已知分组的零成员组是否保留（搜索时传 false：不显示零命中组） */
  keepEmpty?: boolean
}

/**
 * 按 `keyOf` 把条目分段。返回的分组顺序 = `known` 顺序 → 现建的组（按名字）→ 兜底组。
 * 每个条目恰好出现一次。
 */
export function groupItems<T>({
  items,
  keyOf,
  known = [],
  fallback = null,
  unknownGroup,
  keepEmpty = false,
}: GroupItemsOptions<T>): ListGroup<T>[] {
  const byKey = new Map<string, ListGroup<T>>()
  const declared: ListGroup<T>[] = []
  const add = (target: ListGroup<T>[], key: string, label: string): ListGroup<T> => {
    const group: ListGroup<T> = { key, label, items: [] }
    byKey.set(key, group)
    target.push(group)
    return group
  }

  for (const definition of known) {
    if (byKey.has(definition.key)) continue
    add(declared, definition.key, definition.label)
  }

  const dynamic: ListGroup<T>[] = []
  const fallbackItems: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (key === null || key.trim() === '') {
      fallbackItems.push(item)
      continue
    }
    let group = byKey.get(key)
    if (!group) {
      const definition = unknownGroup?.(key) ?? null
      if (definition) {
        // 清单漏记的名字：现建一组（同一个名字后续条目归进同一组）
        group = byKey.get(definition.key) ?? add(dynamic, definition.key, definition.label)
      } else {
        // 连 unknownGroup 都没有这个键：宁可标签难看，也不要把条目丢掉
        group = add(dynamic, key, key)
      }
    }
    group.items.push(item)
  }

  const kept = keepEmpty ? declared : declared.filter((group) => group.items.length > 0)
  dynamic.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans'))
  const result = [...kept, ...dynamic]
  if (fallback !== null && fallbackItems.length > 0) {
    result.push({ key: fallback.key, label: fallback.label, items: fallbackItems })
  }
  return result
}

/**
 * 文件夹定义表：清单里的名字（含空文件夹）+ 条目身上出现的名字（清单可能漏记），
 * 去空白、去重、按 zh-Hans 排序。
 */
export function folderDefinitions(
  folderNames: readonly string[],
  items: readonly { folder?: string }[],
): GroupDefinition[] {
  const names = new Set<string>()
  for (const name of folderNames) {
    const trimmed = name.trim()
    if (trimmed !== '') names.add(trimmed)
  }
  for (const item of items) {
    const trimmed = (item.folder ?? '').trim()
    if (trimmed !== '') names.add(trimmed)
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans'))
    .map((name) => ({ key: folderGroupKey(name), label: name }))
}

/** 文件夹清单漏记时现建一组的定义（key 形如 `folder:甲`） */
export function folderGroupDefinition(key: string): GroupDefinition | null {
  if (!key.startsWith(FOLDER_GROUP_PREFIX)) return null
  const label = key.slice(FOLDER_GROUP_PREFIX.length)
  return label === '' ? null : { key, label }
}

/**
 * 折叠判定：**搜索时一律展开**（命中的组要让用户看见），清空搜索后回到
 * 记下的折叠状态 —— 不需要把「搜索时展开」写回折叠集合。
 */
export function isGroupCollapsed(
  collapsed: ReadonlySet<string>,
  key: string,
  searching: boolean,
): boolean {
  return !searching && collapsed.has(key)
}

/** 切换一个分组的折叠状态（返回新集合，不改入参） */
export function toggleCollapsedKey(
  collapsed: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  const next = new Set(collapsed)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
