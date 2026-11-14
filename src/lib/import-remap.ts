/**
 * 导入后的**引用重映射**（纯函数，不碰 Dexie）。
 *
 * 备份里的 id 是**备份内的编号**；落到目标库时会重新分配（或被「同名跳过」映射到已有那条）。
 * 以前只重映射了 `parentId`，其余引用（国籍 / 事件相关国家 / 参与者 / 命名关系 / 标签 /
 * 正文里的 `mention` / `wikiLink`）仍然带着备份里的数字，于是会**指到目标库里同样数字的另一条**，
 * 或者悬空。
 *
 * 这里按「备份 id → 落库 id」的映射把一行的**全部**引用改写掉。规则分三类，不能混：
 *
 * | 类别 | 例子 | 目标不存在时 |
 * |---|---|---|
 * | 成员事实 | 标签、国籍、参与者、相关角色、层级父级、`references` | 摘掉那条引用（列表项整条移除 / 单值置空） |
 * | 命名语义 | 笔记 `relations`、角色 `relatedNotes`、事件 `relations` | **保留 name / relation / color / arrow**，只解除 `targetId` |
 * | 正文引用 | `document` / 旧 JSON 字符串正文里的 `mention` / `wikiLink` | 保留可读文字（label / raw），清掉 id（不再跳转） |
 *
 * 命名语义为什么不能「跟着删」：那是用户手写的语义（「出生地：已删除的故乡」），
 * 目标没了只是**不可点**，文字必须留着 —— 项目对「目标被删」的一贯口径
 * （见 AGENTS「删除后的残留分两类」）。
 *
 * 正文引用为什么按类型查表：id 在各表里各自从 1 开始，角色 1 与笔记 1 是两条不同的记录。
 * 映射键必须带实体类型（`entityType` / `wikiLink`），否则「角色改 id」会让指向笔记的
 * `[[链接]]` 跟着串号。这也是 `reference-labels.ts` 用 `类型:id` 的原因。
 */

import type { DocNode } from './reference-labels'
import { parseWikiLinkInner } from './vault/wikilink'

export type RefTable = 'characters' | 'countries' | 'events' | 'worldEntries' | 'tags'

export interface IdMaps {
  characters: ReadonlyMap<number, number>
  countries: ReadonlyMap<number, number>
  events: ReadonlyMap<number, number>
  worldEntries: ReadonlyMap<number, number>
  tags: ReadonlyMap<number, number>
}

/** 行里只保留真正变化过的键；没有变化返回 null */
export type RemapKind = 'character' | 'event' | 'country' | 'worldEntry'

/* ── 引用字段登记表（唯一源）────────────────────────────────────────
   导入（重映射 + 载荷规范化）按这张表处理，新增引用字段只改这里。
   字段语义必须与 AGENTS「引用到底靠 id 还是靠名字」那张表一致：
   - `singleRefs` / `parentRefs` / `idLists`：**成员事实**，目标不存在就断开
   - `namedLists`：**命名语义**，保留文字、只解除 targetId
   - `typedLists`：自带目标类型的引用数组（`references`），按类型各自查表
   - `opaqueRefs`：目标类型无法判断的软引用 —— 无法安全映射，只能清空（名字文本仍在）
   - `bodyFields`：正文（Tiptap 文档对象，或老数据里的 JSON 字符串） */

interface SingleRefSpec {
  field: string
  target: RefTable
}

interface NamedListSpec {
  field: string
  target: RefTable
}

interface MemberListSpec {
  field: string
  /** 列表项里存目标 id 的键（如 `characterId` / `targetId`） */
  idKey: string
  target: RefTable
}

interface TypedListSpec {
  field: string
  typeKey: string
  idKey: string
  /** `targetType` 的字面值 → 表。查不到的按「目标类型未知」摘掉 */
  targets: Readonly<Record<string, RefTable>>
}

export interface RowRefSpec {
  /** 名字列（缺省 / 非字符串时的兜底由载荷规范化负责） */
  nameField: string
  bodyFields: readonly string[]
  singleRefs: readonly SingleRefSpec[]
  parentRefs: readonly SingleRefSpec[]
  idLists: readonly SingleRefSpec[]
  namedLists: readonly NamedListSpec[]
  memberLists: readonly MemberListSpec[]
  typedLists: readonly TypedListSpec[]
  opaqueRefs: readonly string[]
}

const CHARACTER_REFS: RowRefSpec = {
  nameField: 'name',
  bodyFields: ['document'],
  // 国籍：单值成员事实（目标不存在 → null）
  singleRefs: [{ field: 'countryId', target: 'countries' }],
  parentRefs: [],
  idLists: [{ field: 'tags', target: 'tags' }],
  // 角色的「相关笔记」是命名边（落盘存 name 快照），目标没了也要留文字
  namedLists: [{ field: 'relatedNotes', target: 'worldEntries' }],
  // 相关角色是成员事实（删角色时 `purgeCharacterReferences` 就是把整条摘掉）
  memberLists: [{ field: 'relatedCharacters', idKey: 'characterId', target: 'characters' }],
  typedLists: [],
  // 阵营是按**名字**解析出来的软引用（可能落在任意一张表），id 到了别的库没有意义
  opaqueRefs: ['factionId'],
}

const EVENT_REFS: RowRefSpec = {
  nameField: 'title',
  // `content` 是老数据的正文（可能是 JSON 字符串，也可能是纯文本）；只有解析出文档才动它
  bodyFields: ['document', 'content'],
  singleRefs: [],
  parentRefs: [{ field: 'parentEventId', target: 'events' }],
  idLists: [
    { field: 'tags', target: 'tags' },
    { field: 'characters', target: 'characters' },
    { field: 'countries', target: 'countries' },
  ],
  // 事件之间是命名边（`docs/模板.md §6.3`），关系名 / 颜色 / 箭头都留着
  namedLists: [{ field: 'relations', target: 'events' }],
  memberLists: [],
  typedLists: [],
  opaqueRefs: [],
}

const COUNTRY_REFS: RowRefSpec = {
  nameField: 'name',
  bodyFields: ['document'],
  singleRefs: [],
  parentRefs: [{ field: 'parentId', target: 'countries' }],
  idLists: [{ field: 'tags', target: 'tags' }],
  namedLists: [],
  memberLists: [],
  typedLists: [],
  opaqueRefs: [],
}

const WORLD_ENTRY_REFS: RowRefSpec = {
  nameField: 'title',
  bodyFields: ['document', 'content'],
  singleRefs: [],
  parentRefs: [{ field: 'parentId', target: 'worldEntries' }],
  idLists: [{ field: 'tags', target: 'tags' }],
  namedLists: [{ field: 'relations', target: 'worldEntries' }],
  memberLists: [],
  typedLists: [
    {
      field: 'references',
      typeKey: 'targetType',
      idKey: 'targetId',
      targets: {
        character: 'characters',
        event: 'events',
        country: 'countries',
        world: 'worldEntries',
        worldEntry: 'worldEntries',
      },
    },
  ],
  opaqueRefs: [],
}

/** 四种带正文的实体的引用字段表 */
export const REF_SPECS: Readonly<Record<RemapKind, RowRefSpec>> = {
  character: CHARACTER_REFS,
  event: EVENT_REFS,
  country: COUNTRY_REFS,
  worldEntry: WORLD_ENTRY_REFS,
}

/** 备份表名 → 引用字段表（`tags` / `periods` 没有引用，保持空表即可） */
export const REF_SPECS_BY_TABLE: Readonly<Record<string, RowRefSpec>> = {
  characters: CHARACTER_REFS,
  events: EVENT_REFS,
  countries: COUNTRY_REFS,
  worldEntries: WORLD_ENTRY_REFS,
  tags: emptyRefSpec('name'),
  periods: emptyRefSpec('name'),
}

function emptyRefSpec(nameField: string): RowRefSpec {
  return emptyRowRefSpec(nameField)
}

/** 没有引用的表（标签 / 时期 / 未知表）用的空登记表 */
export function emptyRowRefSpec(nameField: string): RowRefSpec {
  return {
    nameField,
    bodyFields: [],
    singleRefs: [],
    parentRefs: [],
    idLists: [],
    namedLists: [],
    memberLists: [],
    typedLists: [],
    opaqueRefs: [],
  }
}

/* ── id 归一 ───────────────────────────────────────────────────── */

/**
 * 「像 id」的值 → number。备份里数字与数字字符串都要认（老数据 / fork 备份两种写法都有）。
 * 不是有效 id 返回 null（调用方决定是清空还是保留文字）。
 */
export function toRefId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '' || !/^-?\d+$/.test(text)) return null
    const parsed = Number(text)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** 保留原始写法（字符串 id 映射后仍是字符串，数字仍是数字） */
function preserveForm(original: unknown, mapped: number): string | number {
  return typeof original === 'string' ? String(mapped) : mapped
}

interface MappedIds {
  ids: number[]
  /** 查不到目标的条数（重复值去重不算丢） */
  lost: number
}

function mapIdList(map: ReadonlyMap<number, number>, value: readonly unknown[]): MappedIds {
  const ids: number[] = []
  let lost = 0
  for (const item of value) {
    const id = toRefId(item)
    const mapped = id === null ? undefined : map.get(id)
    if (mapped === undefined) {
      lost += 1
      continue
    }
    if (!ids.includes(mapped)) ids.push(mapped)
  }
  return { ids, lost }
}

/* ── 正文（Tiptap 文档）───────────────────────────────────────── */

/** `entityType` / 节点类型 → 表。查不到 = 目标类型未知，不动它（不猜） */
const BODY_REF_TABLES: Readonly<Record<string, RefTable>> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  world: 'worldEntries',
  worldEntry: 'worldEntries',
}

/** 这个正文节点指向哪张表；不是引用节点返回 null */
function bodyRefTable(node: DocNode): RefTable | null {
  if (node.type === 'wikiLink') return 'worldEntries'
  if (node.type !== 'mention') return null
  const entityType = typeof node.attrs?.entityType === 'string' ? node.attrs.entityType : ''
  return BODY_REF_TABLES[entityType] ?? null
}

interface BodyOutcome {
  value: unknown
  changed: boolean
  unlinked: number
}

/** 正文引用节点在目标库里的新身份：映射到某个 id，或目标不存在（解除跳转） */
type BodyRefDecision = { kind: 'map'; id: string | number } | { kind: 'unlink' }

/**
 * 正文引用节点 → 按**落库身份**重建 attrs（Q02）。
 *
 * 为什么不能只改 `id`：序列化优先写节点的 `raw`（装载时保留的链接原文），
 * 而 raw 记的是**源库**的目标名 —— 导入后目标可能落在另一个文件名上
 * （同名条目 `同名角色 (2).md`），写回 `[[同名角色|昵称]]` 以后重扫会按旧名字
 * 绑到**同名的另一条**。所以导入时一律丢掉旧 raw，只留：
 * - `id`（已按目标库映射；目标不存在时移除 = 不再跳转）
 * - `label`（用户写下的显示名 / 别名，原样保留）
 * - `anchor`（`#锚点`，从旧 raw 里解析出来单独存，序列化时拼回去）
 *
 * 未编辑的笔记不走这里（只重映射本次新增 / 覆盖的行），它们的 raw 一个字节都不动。
 */
function rebindBodyAttrs(
  attrs: Record<string, unknown>,
  decision: BodyRefDecision,
): { attrs: Record<string, unknown>; changed: boolean } {
  const raw = attrs.raw
  const hasRaw = typeof raw === 'string' && raw !== ''
  const parsed = hasRaw ? parseWikiLinkInner(raw) : null

  const next: Record<string, unknown> = { ...attrs }
  let changed = hasRaw
  // 旧 raw 的「目标」部分已经失效（它指的是源库的文件身份）
  if (hasRaw) delete next.raw

  if (decision.kind === 'map') {
    if (!same(attrs.id, decision.id)) {
      next.id = decision.id
      changed = true
    }
  } else if ('id' in next) {
    delete next.id
    changed = true
  }

  if (next.anchor === undefined && parsed?.anchor !== undefined) {
    next.anchor = parsed.anchor
    changed = true
  }
  const label = typeof next.label === 'string' ? next.label : ''
  if (label.trim() === '' && parsed?.alias !== undefined) {
    next.label = parsed.alias
    changed = true
  }
  return { attrs: next, changed }
}

function remapDocNode(node: DocNode, maps: IdMaps): BodyOutcome {
  let attrs = node.attrs
  let changed = false
  let unlinked = 0

  const table = bodyRefTable(node)
  const rawId = node.attrs?.id
  if (table !== null && rawId !== undefined && rawId !== null && rawId !== '') {
    const id = toRefId(rawId)
    const mapped = id === null ? undefined : maps[table].get(id)
    const rebind = rebindBodyAttrs(
      node.attrs as Record<string, unknown>,
      mapped === undefined ? { kind: 'unlink' } : { kind: 'map', id: preserveForm(rawId, mapped) },
    )
    if (rebind.changed) {
      attrs = rebind.attrs
      changed = true
    }
    if (mapped === undefined) unlinked += 1
  }

  let content = node.content
  if (Array.isArray(node.content)) {
    const nextContent = node.content.map((child) => {
      if (!isPlainObject(child)) return child
      const outcome = remapDocNode(child as DocNode, maps)
      if (!outcome.changed) return outcome.value
      unlinked += outcome.unlinked
      return outcome.value
    })
    if (nextContent.some((child, index) => child !== (node.content as unknown[])[index])) {
      content = nextContent as DocNode[]
      changed = true
    }
  }

  if (!changed) return { value: node, changed: false, unlinked: 0 }

  const next: DocNode = { ...node }
  if (attrs !== node.attrs) next.attrs = attrs
  if (content !== node.content) next.content = content
  return { value: next, changed: true, unlinked }
}

/** 文档形态判定：Tiptap 文档是 `{type:'doc', content:[...]}`；不认识的 JSON 不动 */
function isDocLike(value: unknown): value is DocNode {
  if (!isPlainObject(value)) return false
  return value.type === 'doc' || Array.isArray(value.content)
}

/**
 * 正文值 → 重映射后的值。
 *
 * - 对象：按节点递归（只改引用节点的 id）
 * - 字符串：老数据把正文存成 JSON 字符串，解析成功且是文档才改；纯文本原样返回 null（不动）
 */
function remapBodyValue(value: unknown, maps: IdMaps): BodyOutcome | null {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '' || (text[0] !== '{' && text[0] !== '[')) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
    if (!isDocLike(parsed)) return null
    const outcome = remapDocNode(parsed, maps)
    if (!outcome.changed) return null
    // 写回仍是字符串：老字段的形态不因为我们扫了一遍就换掉
    return { value: JSON.stringify(outcome.value), changed: true, unlinked: outcome.unlinked }
  }

  if (!isDocLike(value)) return null
  return remapDocNode(value, maps)
}

/* ── 行级重映射 ────────────────────────────────────────────────── */

export interface RemapResult {
  /** 有变化的键；没变化是 null */
  patch: Record<string, unknown> | null
  /** 因为目标不存在而被断开的**成员事实**条数（标签 / 国籍 / 参与者 / 层级 / references） */
  dropped: number
  /** 目标不存在、但**保留了文字**的命名关系条数（`name` / `relation` / `color` / `arrow` 不动） */
  unresolvedNamed: number
  /** 正文里被解除跳转（保留 label）的引用节点数 */
  unlinked: number
}

/** 命名关系里还有没有值得保留的文字（没有的整条摘掉，别留一行「未命名」） */
function namedRelationHasText(item: Record<string, unknown>): boolean {
  for (const key of ['name', 'relation', 'color']) {
    const value = item[key]
    if (typeof value === 'string' && value.trim() !== '') return true
  }
  return false
}

/** 给一行算出「引用被重映射之后」的补丁（只含变化的键） */
export function remapRowRefs(
  kind: RemapKind,
  row: Record<string, unknown>,
  maps: IdMaps,
): RemapResult {
  const spec = REF_SPECS[kind]
  const patch: Record<string, unknown> = {}
  let dropped = 0
  let unresolvedNamed = 0
  let unlinked = 0

  const setIfChanged = (key: string, next: unknown): void => {
    if (same(row[key], next)) return
    patch[key] = next
  }

  // 标签：四个实体都有，且都是 id 数组
  for (const { field, target } of spec.idLists) {
    const raw = row[field]
    if (!Array.isArray(raw)) continue
    const mapped = mapIdList(maps[target], raw)
    dropped += mapped.lost
    setIfChanged(field, mapped.ids)
  }

  // 单值成员事实（国籍）
  for (const { field, target } of spec.singleRefs) {
    const raw = row[field]
    if (raw === undefined || raw === null) continue
    const id = toRefId(raw)
    const mapped = id === null ? undefined : maps[target].get(id)
    if (mapped === undefined) dropped += 1
    setIfChanged(field, mapped ?? null)
  }

  // 层级父级（国家 / 事件 / 词条）：目标不在这次导入里就当根，不挂到同号的另一条下面
  for (const { field, target } of spec.parentRefs) {
    const raw = row[field]
    if (raw === undefined) continue
    const id = toRefId(raw)
    const mapped = id === null ? undefined : maps[target].get(id)
    if (raw !== null && mapped === undefined) dropped += 1
    setIfChanged(field, mapped ?? null)
  }

  // 命名语义：目标没了也保留原文，只解除 targetId
  for (const { field, target } of spec.namedLists) {
    const raw = row[field]
    if (!Array.isArray(raw)) continue
    const next: Record<string, unknown>[] = []
    for (const item of raw) {
      if (!isPlainObject(item)) {
        dropped += 1
        continue
      }
      // 本来就没有 targetId 的命名边是**纯文字**（目标已删 / 从没连过），原样保留
      const hadTargetId = item.targetId !== undefined && item.targetId !== null
      if (!hadTargetId) {
        next.push(item)
        continue
      }
      const targetId = toRefId(item.targetId)
      const mapped = targetId === null ? undefined : maps[target].get(targetId)
      if (mapped === undefined) {
        if (!namedRelationHasText(item)) {
          // 本来就没有可读文字（例如只有 relation 为空的一条边）：摘掉，不留空行
          dropped += 1
          continue
        }
        const { targetId: _droppedId, ...rest } = item
        void _droppedId
        next.push(rest)
        unresolvedNamed += 1
        continue
      }
      next.push(mapped === targetId ? item : { ...item, targetId: mapped })
    }
    setIfChanged(field, next)
  }

  // 成员关系列表（相关角色）：目标不存在就整条摘掉（与删除时的 purge 口径一致）
  for (const { field, idKey, target } of spec.memberLists) {
    const raw = row[field]
    if (!Array.isArray(raw)) continue
    const next: Record<string, unknown>[] = []
    for (const item of raw) {
      if (!isPlainObject(item)) {
        dropped += 1
        continue
      }
      const id = toRefId(item[idKey])
      const mapped = id === null ? undefined : maps[target].get(id)
      if (mapped === undefined) {
        dropped += 1
        continue
      }
      next.push(mapped === id ? item : { ...item, [idKey]: mapped })
    }
    setIfChanged(field, next)
  }

  // 自带目标类型的引用数组（`references`）：按 typeKey 查对应的表，未知类型不猜
  for (const { field, typeKey, idKey, targets } of spec.typedLists) {
    const raw = row[field]
    if (!Array.isArray(raw)) continue
    const next: Record<string, unknown>[] = []
    for (const item of raw) {
      if (!isPlainObject(item)) {
        dropped += 1
        continue
      }
      const typeName = typeof item[typeKey] === 'string' ? item[typeKey] : ''
      const target = targets[typeName]
      if (target === undefined) {
        dropped += 1
        continue
      }
      const id = toRefId(item[idKey])
      const mapped = id === null ? undefined : maps[target].get(id)
      if (mapped === undefined) {
        dropped += 1
        continue
      }
      next.push(mapped === id ? item : { ...item, [idKey]: mapped })
    }
    setIfChanged(field, next)
  }

  // 类型未知的软引用：无法安全映射（同号可能是另一条），只清空；名字文本仍在，重扫会重新解析
  for (const field of spec.opaqueRefs) {
    const raw = row[field]
    if (raw === undefined || raw === null) continue
    dropped += 1
    setIfChanged(field, undefined)
  }

  // 正文引用：按目标类型查对应的表，兼容字符串 / 数字 id 与旧 JSON 字符串正文
  for (const field of spec.bodyFields) {
    const raw = row[field]
    if (raw === undefined || raw === null) continue
    const outcome = remapBodyValue(raw, maps)
    if (outcome === null) continue
    unlinked += outcome.unlinked
    if (outcome.changed) patch[field] = outcome.value
  }

  return {
    patch: Object.keys(patch).length > 0 ? patch : null,
    dropped,
    unresolvedNamed,
    unlinked,
  }
}
