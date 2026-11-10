/**
 * 把只读能力层包成助手能调的那几个工具（`docs/Agent接入.md`）。
 *
 * 分工：**schema 在插件**（`src/plugins/agent/core/agent/tools.ts`，它是提示词的
 * 一部分），**执行在宿主**（这里）—— 插件不该知道我们的库长什么样，它只会照着
 * schema 发调用；宿主决定这次调用落到哪个能力上。这就是「有机构成」的接缝：
 * 助手说「读一下林知遥」，宿主把它翻成 `getEntity('character', 7)`。
 *
 * 三条硬规矩：
 * - 一律只读。写入要等 `actor` 留痕那条链路（`docs/todo.md` P2 A4）通了再开
 * - 每层都带 `Caller`，权限在 `createCapabilities` 入口检查，这里不自己判
 * - 参数来自模型，**全部当不可信输入校验**，认不出来就回一条 `isError`，
 *   不抛异常（异常会打断整个工具的回合）
 */
import { READ_PERMISSION, type EntityKind } from './types'
import { reservedCategoryReason } from '@/lib/categories/types'
import type { createCapabilities } from './index'

type Capabilities = ReturnType<typeof createCapabilities>

/** 助手这个调用方在库里的身份 —— journal 与审计都靠它认人 */
export const AGENT_CALLER = { actor: 'agent:assistant', permissions: READ_PERMISSION } as const

export const LIBRARY_TOOL_NAMES = [
  'library_list',
  'library_read',
  'library_search',
  'library_graph',
  'library_templates',
  'library_set_fields',
  'library_set_body',
  'library_link',
  'library_create',
  'library_delete',
  'library_set_tags',
  'library_set_media',
  'library_rename',
  'library_set_placement',
  'library_create_category',
  'library_set_novel',
  // ── 兼容别名：已并入上面的工具，模型看不到（不在 TOOL_SPECS 里），
  //    留着是为了旧版设置里存着的工具名还能被认出来、不至于变成「未知工具」。
  'library_set_custom',
  'library_import_image',
] as const

/**
 * 已经合并掉、**不再出现在提示词里**的旧工具名。
 *
 * - `library_set_custom` → 并入 `library_set_fields`（内置列传列、其余进 `custom`）
 * - `library_import_image` → 并入 `library_set_media`（给 `url` 就下载，给 `path` 就引用）
 *
 * 合并的原因很实际：两个工具职责重叠时，模型必须自己判断该用哪个，
 * 而它没有足够信息去判断（比如「附件/x.png 到底在不在库里」）。
 */
export const MERGED_LIBRARY_TOOLS: Record<string, LibraryToolName> = {
  library_set_custom: 'library_set_fields',
  library_import_image: 'library_set_media',
}

export type LibraryToolName = (typeof LIBRARY_TOOL_NAMES)[number]

/** 提示词里真正出现的库工具（兼容别名不在其中） */
export const ADVERTISED_LIBRARY_TOOLS: readonly string[] = LIBRARY_TOOL_NAMES.filter(
  (name) => !(name in MERGED_LIBRARY_TOOLS),
)

/**
 * 可写字段白名单。
 *
 * **只放标量文本**：正文（`document` / `content`）要过 Markdown ⇄ Tiptap 的桥，
 * 桥要拿到链接解析器（`createLinkResolver(scan.index)`），耦合更重 —— 那一版
 * 单独做。名字更是故意不放：改名会改文件名、撞名去重、`[[链接]]` 全库回写，
 * 不是一次字段写入能负责的事。
 */
export const WRITABLE_FIELDS = {
  character: ['race', 'element', 'occupation', 'faction', 'height', 'birthday', 'bio'],
  event: ['time', 'endTime', 'location', 'summary'],
  country: ['description', 'system', 'geography', 'culture'],
  // 词条：一行简介 / 基本信息的时间地点 / 章节大纲；小说专属字段走 `library_set_novel`
  world: ['summary', 'time', 'endTime', 'location', 'chapterOutline'],
} as const satisfies Record<EntityKind, readonly string[]>

/**
 * 图片槽位 —— 只收「已经有文件」的路径。
 *
 * Agent 先把图下载到工作目录（库内），再调 `library_set_media` 写路径；
 * 不做上传 / 裁剪 / 去重（那是图片流水线的事，不是库 API）。
 */
export type MediaSlot = 'avatar' | 'header' | 'flag' | 'cover' | 'image' | 'novelCover'

export const MEDIA_SLOTS: Record<EntityKind, readonly MediaSlot[]> = {
  character: ['avatar', 'header'],
  event: ['header'],
  country: ['flag', 'header'],
  world: ['cover', 'avatar', 'image', 'novelCover'],
}

/**
 * 槽位 → 实体列名（写库要用）。
 *
 * 放在能力层而不是宿主：能力卡片与「这一列工具能不能写」的审计都从这里取，
 * 各写一份必然漂（`avatar` 落 `avatarUrl`、国家 `flag` 落 `flagUrl`）。
 */
export const MEDIA_FIELD: Record<EntityKind, Partial<Record<MediaSlot, string>>> = {
  character: { avatar: 'avatarUrl', header: 'headerUrl' },
  event: { header: 'headerUrl' },
  country: { flag: 'flagUrl', header: 'headerUrl' },
  world: { cover: 'cover', avatar: 'avatar', image: 'image', novelCover: 'novelCover' },
}

/**
 * 工具（`library_set_fields`）不写、但类型里确实存在的字段：写明由**界面或专用工具**维护。
 *
 * 「广告即承诺」：字段表里出现的每一列，要么有工具读写，要么在这里交代去处。
 * `gen-library-guide` 会拿它做覆盖检查 —— 新加一个类型字段却没说清归属，CI 直接失败。
 */
export const UI_ONLY_FIELDS: Record<EntityKind, Record<string, string>> = {
  character: {
    animationUrl: '界面（动画上传）',
    folder: '界面（角色文件夹拖拽）',
    relatedNotes: '界面（相关笔记）',
    gallery: '界面（图集）',
    avatars: '界面（形象立绘）',
    isMajor: '界面（主要角色标记）',
  },
  event: {
    parentEventId: '死列：事件没有层级，任何界面都不建它，不要写',
    relations: '界面（事件关系图）',
    images: '界面（图集）',
    isMajor: '界面（关键事件标记）',
  },
  country: {
    parentId: '界面（表格页「新增子项」才有），工具不读也不写',
    gallery: '界面（图集）',
  },
  world: {
    gallery: '界面（图集）',
    category: 'library_set_placement',
    template: 'library_set_placement',
    parentId: 'library_set_placement',
    relations: '界面（关系图）；工具只读',
    references: '正文里的引用，跟随正文自动维护',
    mapImage: '界面（地图编辑器）',
    mapWidth: '界面（地图编辑器）',
    mapHeight: '界面（地图编辑器）',
    mapSeed: '界面（地图编辑器）',
    mapParams: '界面（地图编辑器）',
    mapMode: '界面（地图编辑器）',
    mapAnnotations: '界面（地图编辑器）',
  },
}

/** 小说根的作品信息：走 library_set_novel，不是普通字段 */
export const NOVEL_FIELDS = [
  'novelAuthor',
  'novelSynopsis',
  'novelTargetWords',
  'novelNotes',
  'novelCover',
] as const

/** 内部簿记 / 旧字段 / 派生值：不进能力卡片，也不该被模型碰 */
export const INTERNAL_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deleted',
  '_syncStatus',
  '_lastModified',
  'order',
  'isConcept',
  'graphPosition',
  'mapPosition',
  'mapId',
  'factionId',
  'nationalityLegacy',
  'lifeStory',
  'legacyKind',
  'content',
])

/** 改名 / 别名：走 library_rename（会同步 `[[链接]]` 文字） */
export const RENAME_FIELDS = ['name', 'title', 'aliases'] as const

/** 正文：走 library_set_body */
export const BODY_FIELDS = ['document'] as const

/** 关系边：走 library_link（只写发起方）或只读 */
export const LINK_FIELDS = [
  'relatedCharacters',
  'countryId',
  'characters',
  'countries',
] as const

/** 自建字段：library_set_fields + create_new / 已有键 */
export const CUSTOM_FIELD = 'custom'

/**
 * 某一类的「可写脚注」：读工具在结果末尾带一行，模型不用再猜哪些键能写。
 * 控制在 ~60 字，比一次试错便宜两个数量级。
 */
export function capabilityFootnote(kind: EntityKind): string {
  const writable = WRITABLE_FIELDS[kind]
  const media = MEDIA_FIELD[kind]
  const mediaText = Object.entries(media)
    .map(([slot]) => slot)
    .join('/')
  const bits = [
    writable.length > 0 ? `可写 ${writable.join('/')}` : '',
    mediaText ? `图 ${mediaText}` : '',
    FOOTNOTE_EXTRA[kind] ?? '',
    '其余界面维护，工具不写',
  ].filter(Boolean)
  return `可写脚注：${bits.join('；')}。`
}

/** 每类最容易写错的那一件事，直接写在读脚注里（国家层级事故的修复点） */
const FOOTNOTE_EXTRA: Partial<Record<EntityKind, string>> = {
  event: 'parentEventId 不要写',
  country: '层级 parentId 只在表格页「新增子项」建，工具不写',
  world: '归类 / 模板 / 父级用 library_set_placement',
}

/**
 * 有的类型确实没有封面槽位 —— 直接说清替代品。
 *
 * 不写这一句，模型会认为「工具坏了」而不是「国家就没有 cover 这个列」，
 * 然后换个槽位名反复试（`cover` / `banner` / `poster`），或者转去搬 `gallery`。
 * 注意这是**媒体列名**与**模板组件名**的区别：国家的「封面」组件读的是 `header`。
 */
const MEDIA_SLOT_NOTE: Partial<Record<EntityKind, string>> = {
  country: '国家没有叫 cover 的列：模板的「封面」组件读 header（横幅），「头像」组件读 flag（旗帜）。',
}

const FIELD_MAX_LENGTH = 4000

/** 正文上限：比字段宽得多，但挡住「模型一口气吐一万字」这种事故 */
const BODY_MAX_LENGTH = 20_000

/**
 * 时间 / 生日列（落盘形态见 `lib/time-field.ts`）。
 *
 * 模型很容易把「霜月三日」「霜岚纪年」这种**纪年名 / 月名**当日期写进来，
 * 界面上的三段输入会把它整个塞进「年」格，变成一眼可见的脏数据。
 * 这里在工具边界就挡掉，并告诉它该写进哪里。
 */
const TIME_FIELDS: Partial<Record<EntityKind, readonly string[]>> = {
  character: ['birthday'],
  event: ['time', 'endTime'],
  world: ['time', 'endTime'],
}

/** `1203` / `1203-04` / `1203-04-15` / `-1203-04-15`，年月日都可缺 */
const TIME_PATTERN = /^-?\d{1,4}(?:-\d{1,2}(?:-\d{1,2})?)?$/

const TIME_FORMAT_HINT =
  '时间只收数字年月日：`1203` / `1203-04` / `1203-04-15`（负年份前加 -）；纪年名 / 月名写进正文或自建字段。'

/** 合规就补零成 `YYYY-MM-DD` 的缺省形态；不合规返回 `null`（空串 = 清空，合法） */
export function normalizeTimeValue(value: string): string | null {
  const text = value.trim()
  if (text === '') return ''
  if (!TIME_PATTERN.test(text)) return null
  const negative = text.startsWith('-')
  const clean = negative ? text.slice(1) : text
  const [year, month, day] = clean.split('-')
  if (month !== undefined && (Number(month) < 1 || Number(month) > 12)) return null
  if (day !== undefined && (Number(day) < 1 || Number(day) > 31)) return null
  let out = `${negative ? '-' : ''}${year.padStart(4, '0')}`
  if (month !== undefined) out += `-${month.padStart(2, '0')}`
  if (day !== undefined) out += `-${day.padStart(2, '0')}`
  return out
}

function isTimeField(kind: EntityKind, key: string): boolean {
  return (TIME_FIELDS[kind] ?? []).includes(key)
}

/** 关系标签长度上限：`同门` / `宿敌` 这种，不该是一段话 */
const RELATION_MAX_LENGTH = 40

/** 新条目标题上限：超过这个长度基本都是把正文塞进标题了 */
const TITLE_MAX_LENGTH = 80

/**
 * 允许建的关系边 —— **只收"真源在发起方"的那三种**（`AGENTS.md` 的成员关系单向原则）。
 *
 * 国家页的「相关角色 / 相关事件」是查询，不是存储；所以这里没有 country → character，
 * 只有 character → country（写 `countryId`，也就是国籍）。多写一份镜像就是又一个会漂的真源。
 */
export const LINKABLE: readonly string[] = [
  'character→character（`relatedCharacters`）',
  'character→country（`countryId`，即国籍）',
  'event→character（`characters`）',
  'event→country（`countries`）',
]

function linkKeyOf(from: { kind: EntityKind; id: number }, to: { kind: EntityKind; id: number }): string | null {
  const pair = `${from.kind}→${to.kind}`
  return LINKABLE.some((item) => item.startsWith(pair)) ? pair : null
}

/**
 * 写回执：落盘路径 + 实际改动的键 + 这一版的 hash。
 *
 * 有它就**不需要再读一遍文件**验证写入 —— 回执就是读。这是省步数（也就是省
 * token）最直接的一处；拿不到（没有笔记库 / 测试环境）时回 `null`，消息照旧。
 */
export interface WriteReceipt {
  /** 库内相对路径，例如 `国家/灰烬自治领.md` */
  path: string
  /** 实际写进 frontmatter 的键；正文记作 `body` */
  keys: string[]
  /** 写完这一版的 sha256（或降级哈希） */
  hash: string
  /** 上一版；新建时为空串 */
  prevHash: string
}

/** 写库动作：注入进来，执行器本身不碰 Dexie（脚本里也能跑） */
export interface LibraryWriter {
  /** 写实体自带的标量列（`race` / `location` …），只收白名单里的键 */
  setFields(kind: EntityKind, id: number, patch: Record<string, string>): Promise<void>
  /** 整篇正文替换。`markdown` 会过 vault 的 Markdown → Tiptap 桥 */
  setBody(kind: EntityKind, id: number, markdown: string): Promise<void>
  /**
   * 建一条关系边。**真源只写在发起方**（全局唯一的单向原则）。
   * 返回 `changed = false` 表示这条已经存在，什么都没动。
   */
  link(
    from: { kind: EntityKind; id: number },
    to: { kind: EntityKind; id: number },
    relation: string,
    toName: string,
  ): Promise<{ changed: boolean }>
  /**
   * 新建一个条目，返回新 id。
   *
   * 落点必须走各 feature 的 `create*`（它会写操作日志、维护索引），
   * 不要在这里手拼一行塞进 Dexie —— 那样会漏掉不变量。
   */
  create(
    kind: EntityKind,
    input: {
      title: string
      fields: Record<string, string>
      /** 仅 `world`：分类名（自定义分类 / 小说 / 地图）、模板名、父词条 */
      category?: string
      template?: string
      parentId?: number | null
    },
  ): Promise<number>
  /** 软删除（进回收站）。不要用文件系统删除 */
  delete(kind: EntityKind, id: number): Promise<void>
  /** 按名字打标签：库里没有的名字会被创建；返回最终落下的标签 */
  setTags(kind: EntityKind, id: number, names: string[]): Promise<{ id: number; name: string }[]>
  /** 合并写自建字段（`custom`）；空串表示删掉这个键 */
  setCustom(kind: EntityKind, id: number, fields: Record<string, string>): Promise<void>
  /** 写图片槽位；`path` 是库内相对路径，文件必须已经存在 */
  setMedia(kind: EntityKind, id: number, slot: MediaSlot, path: string): Promise<void>
  /** 下载 http(s) 图片到 `附件/` 并写进槽位；返回最终路径与字节数 */
  importImage(
    kind: EntityKind,
    id: number,
    slot: MediaSlot,
    url: string,
    filename?: string,
  ): Promise<{ path: string; bytes: number }>
  /** 改名（同步更新 `[[链接]]` 的文字）；给了 aliases 就整组替换 */
  rename(kind: EntityKind, id: number, title: string, aliases?: string[]): Promise<void>
  /** 只对 `world`：归类 / 换模板 / 换父级（空串清空，parentId null = 根） */
  setPlacement(
    id: number,
    input: { category?: string; template?: string; parentId?: number | null },
  ): Promise<void>
  /** 新建自定义分类；给 fields 时同时建一个基本信息组件 + 笔记模板 */
  createCategory(input: {
    name: string
    template?: string
    icon?: string
    fields?: string[]
    labels?: Record<string, string>
  }): Promise<{ id: string; name: string; template: string; group?: string; fields?: string[] }>
  /** 只对小说根：作品信息（作者 / 简介 / 目标字数 / 笔记 / 封面） */
  setNovel(
    id: number,
    input: {
      author?: string
      synopsis?: string
      targetWords?: number
      notes?: string
      cover?: string
    },
  ): Promise<void>
  /**
   * 可选：拿这次写入的回执。没有笔记库（脚本 / 浏览器直跑）时返回 `null`。
   * `changedKeys` 是执行器实际提交的键，宿主可用来对照盘上真正落下的键。
   */
  receipt?(kind: EntityKind, id: number, changedKeys: string[]): Promise<WriteReceipt | null>
}

/**
 * 库的「目录」：模板长什么样、分类挂了哪个模板、每个模板有哪些组件与字段。
 *
 * 模型经常需要它 —— 「地点模板有哪些槽位」「宠物分类用哪套字段」光看字段组名
 * 是推不出来的，猜错就会往一个不存在的字段里写值。这是一次只读快照。
 */
export interface LibraryCatalogEntry {
  id: string
  name: string
  /** 组件 id 与是否启用；`params` 里有 `group` 的说明它引用了哪个字段组 */
  components: { id: string; enabled: boolean }[]
  /** 这个模板绑定的基本信息字段组（键 + 显示名） */
  fields: { key: string; label: string }[]
}

export interface LibraryCatalogView {
  templates: LibraryCatalogEntry[]
  categories: { name: string; template: string; enabled: boolean }[]
}

export interface LibraryCatalog {
  describe(): Promise<LibraryCatalogView>
  /**
   * 这条条目所属模板 / 字段表声明了哪些自建键。
   *
   * 模板里写着的字段，条目上可能还没落键（值从没写过）。它们不是「未知键」，
   * 写库时不该再要求模型先 `create_new` 试一次 —— 那一步既费 token 又容易
   * 把模型的注意力带到「工具不信任我」上。
   */
  declaredFields?(kind: EntityKind, id: number): Promise<string[]>
}

export const KINDS: readonly EntityKind[] = ['character', 'event', 'country', 'world']

export const KIND_LABEL: Record<EntityKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

function kindOf(value: unknown): EntityKind | null {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
    ? (value as EntityKind)
    : null
}

function numberOf(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

interface ToolResult {
  content: string
  isError: boolean
  data?: unknown
  durationMs: number
}

function ok(content: string, data?: unknown): ToolResult {
  return { content, isError: false, data, durationMs: 0 }
}

function fail(content: string): ToolResult {
  return { content, isError: true, durationMs: 0 }
}

function summaryLine(row: {
  kind: EntityKind
  id: number
  title: string
  aliases: string[]
  tags: string[]
  matchedIn?: 'title' | 'alias' | 'tag' | 'body'
}): string {
  const extras = [row.aliases.length > 0 ? `别名 ${row.aliases.join('、')}` : '', row.tags.length > 0 ? `标签 ${row.tags.join('、')}` : '']
    .filter(Boolean)
    .join(' · ')
  const hit = row.matchedIn === 'body' ? '正文命中' : ''
  const tail = [extras, hit].filter(Boolean).join(' · ')
  return `- [${KIND_LABEL[row.kind]} #${row.id}] ${row.title}${tail ? `（${tail}）` : ''}`
}

/** 读正文默认只给这么多 —— 4k 之后的部分会在循环里被反复回放，不划算 */
const BODY_PREVIEW = 4000

function shortHash(value: string): string {
  return value === '' ? '—' : value.slice(0, 7)
}

/**
 * 回执三行：路径 / 改动键 / 版本。
 * 模型看到它就不用再读一遍文件、更不用翻 journal —— 这是省步数的关键。
 */
function receiptBlock(receipt: WriteReceipt | null): string {
  if (!receipt) return ''
  const keys = receipt.keys.length > 0 ? receipt.keys.join('、') : '（无字段变化）'
  return `\n已写入 ${receipt.path}\n改动：${keys}\n版本：${shortHash(receipt.hash)}（上一版 ${shortHash(receipt.prevHash)}）`
}

async function receiptOf(
  writer: LibraryWriter | undefined,
  kind: EntityKind,
  id: number,
  changedKeys: string[],
): Promise<WriteReceipt | null> {
  if (!writer?.receipt) return null
  try {
    return await writer.receipt(kind, id, changedKeys)
  } catch {
    return null
  }
}

/** 模板 / 字段表声明的键；宿主没提供目录或读失败时当作「没有声明」 */
async function declaredFieldsOf(
  catalog: LibraryCatalog | undefined,
  kind: EntityKind,
  id: number,
): Promise<string[]> {
  if (!catalog?.declaredFields) return []
  try {
    return await catalog.declaredFields(kind, id)
  } catch {
    return []
  }
}

/** 被拒键的分类：字段不存在 / 由界面维护 / 自建字段还没建 / 值本身不合法 */
type RejectedCode = 'unknown-field' | 'ui-only' | 'new-field' | 'invalid-value'

interface RejectedKey {
  key: string
  code: RejectedCode
  note: string
}

function classifyRejectedKey(
  kind: EntityKind,
  key: string,
  allowNew: boolean,
): RejectedKey {
  const uiNote = UI_ONLY_FIELDS[kind][key]
  if (uiNote) return { key, code: 'ui-only', note: uiNote }
  if ((RENAME_FIELDS as readonly string[]).includes(key)) {
    return { key, code: 'ui-only', note: '改名 / 别名走 library_rename' }
  }
  const other = KINDS.find(
    (candidate) => candidate !== kind && (WRITABLE_FIELDS[candidate] as readonly string[]).includes(key),
  )
  if (other) {
    return {
      key,
      code: 'unknown-field',
      note: `${KIND_LABEL[kind]}没有这个字段；${key} 是${KIND_LABEL[other]}的`,
    }
  }
  return {
    key,
    code: 'new-field',
    note: allowNew
      ? '自建字段名不能为空'
      : '这是自建字段，但这条还没有这个键：确实要新建就加 create_new: true',
  }
}

/**
 * 造一个「先问宿主、宿主不认识就交回插件」的执行器。
 *
 * 返回 `null` 表示这个名字不归宿主管，调用方继续走原来的路径（插件的 Rust
 * 文件工具）；返回结果就表示已经处理完。
 */
export function createLibraryToolExecutor(
  capabilities: Capabilities,
  writer?: LibraryWriter,
  catalog?: LibraryCatalog,
) {
  return async function resolveLibraryTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult | null> {
    if (!(LIBRARY_TOOL_NAMES as readonly string[]).includes(name)) return null
    // 合并掉的旧工具名继续认：转给接手的那个，行为完全一致
    const merged = MERGED_LIBRARY_TOOLS[name]
    if (merged) name = merged

    const started = Date.now()
    const finish = (result: ToolResult): ToolResult => ({ ...result, durationMs: Date.now() - started })

    try {
      if (name === 'library_list') {
        const asked = kindOf(args.kind)
        const limit = numberOf(args.limit, 40, 1, 200)
        const category = textOf(args.category).slice(0, 60)
        const tag = textOf(args.tag).slice(0, 40)
        const isMajor = args.isMajor === true
        if (!asked && (category !== '' || tag !== '' || isMajor)) {
          return finish(fail('category / tag / isMajor 要配合 kind 用：先说要列哪一类。'))
        }
        const filter = {
          ...(category !== '' ? { category } : {}),
          ...(tag !== '' ? { tag } : {}),
          ...(isMajor ? { isMajor } : {}),
        }
        const filterNote = [
          category !== '' ? `分类「${category}」` : '',
          tag !== '' ? `标签「${tag}」` : '',
          isMajor ? '仅主要角色' : '',
        ]
          .filter(Boolean)
          .join(' · ')
        if (asked) {
          const rows = await capabilities.listEntities(AGENT_CALLER, asked, limit, filter)
          if (rows.length === 0) {
            return finish(
              ok(
                filterNote === ''
                  ? `库里还没有${KIND_LABEL[asked]}。`
                  : `没有符合「${filterNote}」的${KIND_LABEL[asked]}。`,
              ),
            )
          }
          return finish(
            ok(
              `${KIND_LABEL[asked]}共列出 ${rows.length} 条（最近改动在前）${
                filterNote === '' ? '' : `，筛选：${filterNote}`
              }：\n${rows.map(summaryLine).join('\n')}`,
              rows,
            ),
          )
        }
        // 不指定类型 = 先给一张清单，别把整库灌进上下文
        const groups = await Promise.all(
          KINDS.map(async (kind) => {
            const rows = await capabilities.listEntities(AGENT_CALLER, kind, limit)
            return `${KIND_LABEL[kind]} ${rows.length} 条${rows.slice(0, 5).map((row) => `\n${summaryLine(row)}`).join('')}`
          }),
        )
        return finish(ok(groups.join('\n\n')))
      }

      // library_templates：库目录（模板组件 / 字段组 / 分类）
      if (name === 'library_templates') {
        if (!catalog) return finish(fail('这个环境读不到模板目录。'))
        const view = await catalog.describe()
        const lines: string[] = ['# 模板与分类']
        if (view.templates.length === 0) {
          lines.push('（还没有模板）')
        } else {
          for (const template of view.templates) {
            const components = template.components
              .filter((component) => component.enabled)
              .map((component) => component.id)
              .join(' / ')
            const fields =
              template.fields.length > 0
                ? `\n  字段：${template.fields.map((field) => `${field.key}（${field.label}）`).join('、')}`
                : ''
            lines.push(`- ${template.name}（${template.id}）：${components || '无组件'}${fields}`)
          }
        }
        if (view.categories.length > 0) {
          lines.push('', '分类：')
          for (const category of view.categories) {
            lines.push(`- ${category.name} → 模板 ${category.template}${category.enabled ? '' : '（未启用）'}`)
          }
        }
        return finish(ok(lines.join('\n'), view))
      }

      if (name === 'library_read') {
        const kind = kindOf(args.kind)
        if (!kind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const id = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (id < 0) return finish(fail('需要实体 id。先用 library_list 或 library_search 拿到它。'))
        const entry = await capabilities.getEntity(AGENT_CALLER, kind, id)
        // 正文默认截 4k：整篇回放给模型的成本是复利，要全文得显式要
        const slice = args.include_body === true
          ? capabilities.buildCodexSlice(entry)
          : capabilities.buildCodexSlice(entry, { bodyLimit: BODY_PREVIEW })
        // 模板 / 字段表声明的键：条目上可能还没值，但写库时可以直接用。
        // 不列出来，模型只能先试一次 create_new（`学名` 那次就是这么被拒的）。
        const declared = await declaredFieldsOf(catalog, kind, id)
        const unset = declared.filter((key) => !(entry.custom[key] ?? '').trim())
        const declaredNote =
          declared.length > 0
            ? `模板字段（可直接写）：${declared.join(' / ')}${unset.length > 0 ? `；未写：${unset.join(' / ')}` : ''}`
            : ''
        // 读脚注：这一条现在能写什么、哪些界面维护 —— 省掉「试写 → 被拒 → 再猜」
        const notes = [declaredNote, capabilityFootnote(kind)].filter(Boolean).join('\n')
        return finish(ok(`${slice}\n\n${notes}`, entry))
      }

      if (name === 'library_search') {
        const query = textOf(args.query)
        if (query === '') return finish(fail('query 不能为空。'))
        const limit = numberOf(args.limit, 20, 1, 50)
        const scanBody = args.include_body !== false
        const rows = await capabilities.search(AGENT_CALLER, query, limit, { body: scanBody })
        if (rows.length === 0) {
          return finish(
            ok(
              scanBody
                ? `没有匹配「${query}」的条目（标题、别名、标签、正文都看过了）。`
                : `没有匹配「${query}」的条目（这次没搜正文）。`,
            ),
          )
        }
        const bodyHits = rows.filter((row) => row.matchedIn === 'body').length
        const tail = bodyHits > 0 ? `\n（其中 ${bodyHits} 条只在正文里出现）` : ''
        return finish(
          ok(`匹配「${query}」${rows.length} 条：${tail}\n${rows.map(summaryLine).join('\n')}`, rows),
        )
      }

      // library_create：新建条目（走各 feature 的 create*，不手拼行）
      if (name === 'library_create') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const createKind = kindOf(args.kind)
        if (!createKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const title = textOf(args.title).slice(0, TITLE_MAX_LENGTH)
        if (title === '') return finish(fail('title 不能为空。'))
        // 幂等：同名条目已存在就返回它，不建第二条。重复条目是作者最难清理的脏数据。
        const existing = (await capabilities.search(AGENT_CALLER, title, 10, { body: false })).find(
          (row) => row.kind === createKind && row.title.trim() === title,
        )
        if (existing) {
          return finish(
            ok(
              `库里已有${KIND_LABEL[createKind]}「${existing.title}」（#${existing.id}），没有再建。` +
                '要改它就用 library_set_fields / library_set_body / library_link。',
              { id: existing.id, existing: true },
            ),
          )
        }
        const writable: readonly string[] = WRITABLE_FIELDS[createKind]
        const fields: Record<string, string> = {}
        if (args.fields !== undefined && args.fields !== null) {
          if (typeof args.fields !== 'object' || Array.isArray(args.fields)) {
            return finish(fail('fields 必须是一个对象，键是要填的字段名。'))
          }
          for (const [key, value] of Object.entries(args.fields as Record<string, unknown>)) {
            if (!writable.includes(key)) continue
            const raw = textOf(value)
            if (isTimeField(createKind, key)) {
              const normalized = normalizeTimeValue(raw)
              if (normalized === null) {
                return finish(
                  fail(`${KIND_LABEL[createKind]}的 ${key} 不是合法日期，没有新建。${TIME_FORMAT_HINT}`),
                )
              }
              fields[key] = normalized
              continue
            }
            fields[key] = raw.slice(0, FIELD_MAX_LENGTH)
          }
        }
        // 词条的结构参数：分类 / 模板 / 父词条（小说章节、自定义分类条目靠它们）
        const category = createKind === 'world' ? textOf(args.category).slice(0, 60) : ''
        const template = createKind === 'world' ? textOf(args.template).slice(0, 60) : ''
        let parentId: number | null = null
        if (createKind === 'world' && args.parentId !== undefined && args.parentId !== null) {
          const parsed = numberOf(args.parentId, -1, 0, Number.MAX_SAFE_INTEGER)
          if (parsed < 0) return finish(fail('parentId 必须是已有的词条 id。'))
          // 父级必须真的存在，否则会建出一条挂空的分支
          await capabilities.getEntity(AGENT_CALLER, 'world', parsed)
          parentId = parsed
        }
        const newId = await writer.create(createKind, {
          title,
          fields,
          category: category || undefined,
          template: template || undefined,
          parentId,
        })
        const created = await capabilities.getEntity(AGENT_CALLER, createKind, newId)
        const receipt = await receiptOf(writer, createKind, newId, Object.keys(fields))
        return finish(
          ok(
            `已新建${KIND_LABEL[createKind]}「${created.title}」（#${newId}）。${receiptBlock(receipt)}\n\n${capabilities.buildCodexSlice(created)}`,
            { id: newId, kind: createKind },
          ),
        )
      }

      // library_delete：软删除（进回收站）—— 唯一允许的删除路径
      if (name === 'library_delete') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const deleteKind = kindOf(args.kind)
        if (!deleteKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const deleteId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (deleteId < 0) return finish(fail('需要实体 id。'))
        const entry = await capabilities.getEntity(AGENT_CALLER, deleteKind, deleteId)
        await writer.delete(deleteKind, deleteId)
        return finish(
          ok(`已把「${entry.title}」移入回收站（${KIND_LABEL[deleteKind]} #${deleteId}）。`, {
            id: deleteId,
            kind: deleteKind,
          }),
        )
      }

      // library_set_tags：按名字打标签（没有就建）。支持批量：ids 数组
      if (name === 'library_set_tags') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const tagKind = kindOf(args.kind)
        if (!tagKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const targets: number[] = []
        if (Array.isArray(args.ids)) {
          for (const item of args.ids) {
            const parsed = numberOf(item, -1, 0, Number.MAX_SAFE_INTEGER)
            if (parsed >= 0 && !targets.includes(parsed)) targets.push(parsed)
            if (targets.length >= 50) break
          }
        } else {
          const single = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
          if (single >= 0) targets.push(single)
        }
        if (targets.length === 0) return finish(fail('需要 id 或 ids（批量最多 50 条）。'))
        if (!Array.isArray(args.tags)) return finish(fail('tags 必须是字符串数组。'))
        const names: string[] = []
        for (const item of args.tags) {
          if (typeof item !== 'string') continue
          const name = item.trim().slice(0, 30)
          if (name !== '' && !names.includes(name)) names.push(name)
          if (names.length >= 20) break
        }
        // 批量前先确认这些 id 真的存在（一次列全，不要每条各读一次库）
        const known = new Set(
          (await capabilities.listEntities(AGENT_CALLER, tagKind, 200)).map((row) => row.id),
        )
        const missing = targets.filter((id) => !known.has(id))
        const live = targets.filter((id) => known.has(id))
        if (live.length === 0) {
          return finish(fail(`这些 id 都不存在：${targets.join('、')}。先用 library_list 看一遍。`))
        }
        let last: { id: number; name: string }[] = []
        for (const id of live) last = await writer.setTags(tagKind, id, names)
        const now = last.length > 0 ? last.map((tag) => tag.name).join('、') : '（已清空）'
        const scope =
          live.length === 1
            ? `${KIND_LABEL[tagKind]} #${live[0]}`
            : `${KIND_LABEL[tagKind]} ${live.length} 条（#${live.join('、#')}）`
        const missingNote = missing.length > 0 ? `\n没找到：${missing.join('、')}` : ''
        return finish(ok(`已给${scope}打上：${now}${missingNote}`, { tags: last, updated: live, missing }))
      }

      // library_set_custom 已在入口映射到 library_set_fields（见 MERGED_LIBRARY_TOOLS）

      // library_set_media：写图片槽位 —— 给 url 就下载进 附件/，给 path 就引用库内已有文件
      if (name === 'library_set_media') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const mediaKind = kindOf(args.kind)
        if (!mediaKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const mediaId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (mediaId < 0) return finish(fail('需要实体 id。'))
        const slot = textOf(args.slot) as MediaSlot
        if (!MEDIA_SLOTS[mediaKind].includes(slot)) {
          const note = MEDIA_SLOT_NOTE[mediaKind]
          return finish(
            fail(
              `${KIND_LABEL[mediaKind]}的图片槽位只有：${MEDIA_SLOTS[mediaKind].join(' / ')}。` +
                (note ? `\n${note}` : ''),
            ),
          )
        }
        const url = textOf(args.url).slice(0, 2000)
        const path = textOf(args.path).replace(/\\/g, '/').slice(0, 500)
        if (url !== '' && path !== '') return finish(fail('url 与 path 只能给一个。'))
        if (url === '' && path === '') {
          return finish(
            fail('给 url（从网上抓一张存进库）或 path（引用库里已有的图）。'),
          )
        }
        // 换图时把旧路径带回去：同名文件会被 Rust 存成 `-2`，旧的就成了孤儿；
        // 不给提示，调用方永远不知道盘上多了一张没人引用的图。
        const before = await capabilities.getEntity(AGENT_CALLER, mediaKind, mediaId)
        const previous = before.media?.[slot] ?? ''
        const previousNote = (next: string): string =>
          previous !== '' && previous !== next
            ? `\n旧图：${previous}（这条已不再引用，文件仍在库里）`
            : ''
        if (url !== '') {
          if (!/^https?:\/\//i.test(url)) return finish(fail('url 必须是 http(s) 地址。'))
          const filename = textOf(args.filename).slice(0, 80)
          const saved = await writer.importImage(
            mediaKind,
            mediaId,
            slot,
            url,
            filename === '' ? undefined : filename,
          )
          return finish(
            ok(
              `已把图片下载到「${saved.path}」并设为${KIND_LABEL[mediaKind]} #${mediaId} 的 ${slot}。${previousNote(saved.path)}`,
              saved,
            ),
          )
        }
        if (/^[a-zA-Z]:|^\//.test(path) || path.split('/').includes('..')) {
          return finish(fail('path 必须是库内相对路径，不能是绝对路径或带 ..。'))
        }
        try {
          await writer.setMedia(mediaKind, mediaId, slot, path)
        } catch (error) {
          // 文件不在库里时给出下一步 —— 模型拿不到「库里有什么」的信息，
          // 光报「找不到文件」它只会换个路径再试一次
          const message = error instanceof Error ? error.message : String(error)
          return finish(
            fail(`${message}。要是这张图还在网上，改给 url 让宿主下载；否则先用 glob / list_dir 确认路径。`),
          )
        }
        return finish(
          ok(
            `已设置${KIND_LABEL[mediaKind]} #${mediaId} 的 ${slot}：${path}${previousNote(path)}`,
            { slot, path },
          ),
        )
      }

      // library_rename：改名（feature 的 update* 会同步 [[链接]] 文字）
      if (name === 'library_rename') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const renameKind = kindOf(args.kind)
        if (!renameKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const renameId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (renameId < 0) return finish(fail('需要实体 id。'))
        const title = textOf(args.title).slice(0, TITLE_MAX_LENGTH)
        if (title === '') return finish(fail('新标题不能为空。'))
        let aliases: string[] | undefined
        if (args.aliases !== undefined && args.aliases !== null) {
          if (!Array.isArray(args.aliases)) return finish(fail('aliases 必须是字符串数组。'))
          aliases = []
          for (const item of args.aliases) {
            if (typeof item !== 'string') continue
            const alias = item.trim().slice(0, 40)
            if (alias !== '' && !aliases.includes(alias)) aliases.push(alias)
            if (aliases.length >= 20) break
          }
        }
        await writer.rename(renameKind, renameId, title, aliases)
        const receipt = await receiptOf(writer, renameKind, renameId, aliases ? ['title', 'aliases'] : ['title'])
        return finish(
          ok(
            `已把${KIND_LABEL[renameKind]} #${renameId} 改名为「${title}」${
              aliases ? `，别名 ${aliases.length} 个` : ''
            }。${receiptBlock(receipt)}`,
          ),
        )
      }

      // library_set_placement：只对 world —— 归类 / 换模板 / 换父级
      if (name === 'library_set_placement') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const placeKind = kindOf(args.kind)
        if (placeKind !== 'world') return finish(fail('只有词条（world）有分类 / 模板 / 父级。'))
        const placeId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (placeId < 0) return finish(fail('需要实体 id。'))
        const hasCategory = args.category !== undefined
        const hasTemplate = args.template !== undefined
        const hasParent = args.parentId !== undefined
        if (!hasCategory && !hasTemplate && !hasParent) {
          return finish(fail('至少给 category / template / parentId 之一。'))
        }
        const placement: { category?: string; template?: string; parentId?: number | null } = {}
        if (hasCategory) placement.category = textOf(args.category).slice(0, 60)
        if (hasTemplate) placement.template = textOf(args.template).slice(0, 60)
        if (hasParent) {
          if (args.parentId === null) {
            placement.parentId = null
          } else {
            const parentId = numberOf(args.parentId, -1, 0, Number.MAX_SAFE_INTEGER)
            if (parentId < 0) return finish(fail('parentId 必须是已有的词条 id，或 null。'))
            if (parentId === placeId) return finish(fail('不能把条目挂到它自己下面。'))
            await capabilities.getEntity(AGENT_CALLER, 'world', parentId)
            placement.parentId = parentId
          }
        }
        await writer.setPlacement(placeId, placement)
        const receipt = await receiptOf(writer, 'world', placeId, Object.keys(placement))
        return finish(ok(`已更新词条 #${placeId} 的归类。${receiptBlock(receipt)}`, placement))
      }

      // library_create_category：新建自定义分类（可选一键带字段组 + 模板）
      if (name === 'library_create_category') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const categoryName = textOf(args.name).slice(0, 40)
        if (categoryName === '') return finish(fail('分类名不能为空。'))
        const template = textOf(args.template).slice(0, 60)
        const icon = textOf(args.icon).slice(0, 40)
        // 内置目录名不是分类：小说根与章节已经写着 `category: '小说'`，
        // 再建一个同名分类等于给同一批笔记开第二个入口（侧栏会多出一个「假的小说页」）。
        // 直接挡掉并告诉模型该走哪条路，别让它下一步自己猜。
        const reserved = reservedCategoryReason(categoryName)
        if (reserved !== '') {
          return finish(
            fail(
              `${reserved}小说请用 \`library_set_novel\` 设作品信息、\`novel_write_chapter\`（创作模式 + 作者打开写回）写章节；` +
                '地图用地图页新建。',
            ),
          )
        }
        const fields: string[] = []
        if (args.fields !== undefined && args.fields !== null) {
          if (!Array.isArray(args.fields)) return finish(fail('fields 必须是字符串数组。'))
          for (const item of args.fields) {
            if (typeof item !== 'string') continue
            const field = item.trim().slice(0, 40)
            if (field !== '' && !fields.includes(field)) fields.push(field)
            if (fields.length >= 30) break
          }
        }
        const labels: Record<string, string> = {}
        if (args.labels !== undefined && args.labels !== null) {
          if (typeof args.labels !== 'object' || Array.isArray(args.labels)) {
            return finish(fail('labels 必须是对象（键 = 字段键，值 = 显示名）。'))
          }
          for (const [key, value] of Object.entries(args.labels as Record<string, unknown>)) {
            const label = textOf(value).slice(0, 40)
            if (label !== '') labels[key.trim().slice(0, 40)] = label
          }
        }
        const created = await writer.createCategory({
          name: categoryName,
          template: template || undefined,
          icon: icon || undefined,
          fields: fields.length > 0 ? fields : undefined,
          labels: Object.keys(labels).length > 0 ? labels : undefined,
        })
        return finish(
          ok(
            `已新建分类「${created.name}」（模板「${created.template}」${
              created.fields?.length ? `，字段 ${created.fields.join(' / ')}` : ''
            }）。`,
            created,
          ),
        )
      }

      // library_set_novel：小说根的作品信息
      if (name === 'library_set_novel') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const novelId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (novelId < 0) return finish(fail('需要小说根 id。'))
        const input: {
          author?: string
          synopsis?: string
          notes?: string
          cover?: string
          targetWords?: number
        } = {}
        if (args.author !== undefined) input.author = textOf(args.author).slice(0, 4000)
        if (args.synopsis !== undefined) input.synopsis = textOf(args.synopsis).slice(0, 4000)
        if (args.notes !== undefined) input.notes = textOf(args.notes).slice(0, 4000)
        if (args.cover !== undefined) input.cover = textOf(args.cover).slice(0, 500)
        if (args.targetWords !== undefined) {
          const target = numberOf(args.targetWords, -1, 0, 100_000_000)
          if (target < 0) return finish(fail('targetWords 必须是正整数。'))
          input.targetWords = target
        }
        if (Object.keys(input).length === 0) return finish(fail('至少要给一个作品信息字段。'))
        await writer.setNovel(novelId, input)
        return finish(ok(`已更新小说 #${novelId} 的作品信息。`, input))
      }

      // library_link：建一条关系边（真源只写发起方）
      if (name === 'library_link') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const fromKind = kindOf(args.from)
        const toKind = kindOf(args.to)
        if (!fromKind || !toKind) {
          return finish(fail('from / to 必须是 character / event / country / world 之一。'))
        }
        const fromId = numberOf(args.fromId, -1, 0, Number.MAX_SAFE_INTEGER)
        const toId = numberOf(args.toId, -1, 0, Number.MAX_SAFE_INTEGER)
        if (fromId < 0 || toId < 0) return finish(fail('需要 fromId 与 toId。'))
        if (fromKind === toKind && fromId === toId) return finish(fail('不能连到自己。'))
        if (linkKeyOf({ kind: fromKind, id: fromId }, { kind: toKind, id: toId }) === null) {
          return finish(fail(`不支持 ${fromKind} → ${toKind}。能建的是：${LINKABLE.join('、')}。`))
        }
        const relation = textOf(args.relation).slice(0, RELATION_MAX_LENGTH)
        if (relation === '') return finish(fail('relation 不能为空，写清楚是什么关系。'))
        // 两端都要真的存在，否则会写出一条指向空气的边
        const [fromEntry, toEntry] = await Promise.all([
          capabilities.getEntity(AGENT_CALLER, fromKind, fromId),
          capabilities.getEntity(AGENT_CALLER, toKind, toId),
        ])
        const linked = await writer.link(
          { kind: fromKind, id: fromId },
          { kind: toKind, id: toId },
          relation,
          toEntry.title,
        )
        return finish(
          ok(
            linked.changed
              ? `已建立 ${fromEntry.title} → ${toEntry.title}（${relation}）。`
              : `${fromEntry.title} 与 ${toEntry.title} 之间已经有这条关系，没有改动。`,
            { changed: linked.changed },
          ),
        )
      }

      // library_graph
      const kind = kindOf(args.kind)
      if (!kind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
      const id = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
      if (id < 0) return finish(fail('需要实体 id。'))
      if (name === 'library_set_fields') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const raw = args.fields
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          return finish(fail('fields 必须是一个对象，键是要改的字段名。'))
        }
        const writable: readonly string[] = WRITABLE_FIELDS[kind]
        // 自建字段只能改「这条本来就有的键」——否则打错一个字就多出一个脏字段，
        // 而且界面上还看不见（字段表里没有这个键）。要新建得显式说明。
        const before = await capabilities.getEntity(AGENT_CALLER, kind, id)
        const knownCustom = new Set(Object.keys(before.custom ?? {}))
        const allowNew = args.create_new === true
        // 模板 / 字段表声明过的键：条目上还没值也算「认识的键」，不需要 create_new
        const declared = new Set(await declaredFieldsOf(catalog, kind, id))
        const columns: Record<string, string> = {}
        const customPatch: Record<string, string> = {}
        const rejected: RejectedKey[] = []
        for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
          const key = rawKey.trim().slice(0, 60)
          if (key === '') continue
          const text = textOf(value).slice(0, FIELD_MAX_LENGTH)
          if (isTimeField(kind, key)) {
            const normalized = normalizeTimeValue(text)
            if (normalized === null) {
              rejected.push({ key, code: 'invalid-value', note: TIME_FORMAT_HINT })
            } else {
              columns[key] = normalized
            }
            continue
          }
          if (writable.includes(key)) {
            columns[key] = text
          } else if (knownCustom.has(key) || allowNew || declared.has(key)) {
            customPatch[key] = text
          } else {
            rejected.push(classifyRejectedKey(kind, key, allowNew))
          }
          if (Object.keys(columns).length + Object.keys(customPatch).length >= 60) break
        }
        const columnKeys = Object.keys(columns)
        const customKeys = Object.keys(customPatch)
        const declaredNote =
          declared.size > 0 ? `\n模板 / 字段表声明的键（可直接写）：${[...declared].join('、')}。` : ''
        if (columnKeys.length === 0 && customKeys.length === 0) {
          if (rejected.length === 0) return finish(fail('fields 是空的。'))
          const existing = knownCustom.size > 0 ? `\n这条现有的自建字段：${[...knownCustom].join('、')}。` : ''
          const lines = rejected.map((item) => `- [${item.code}] ${item.key}：${item.note}`)
          return finish(
            fail(
              `这些键没有写：\n${lines.join('\n')}\n` +
                `内置可写：${writable.join(' / ') || '无'}。${existing}${declaredNote}` +
                '要新建自建字段才加 create_new: true。',
            ),
          )
        }
        if (columnKeys.length > 0) await writer.setFields(kind, id, columns)
        if (customKeys.length > 0) {
          // 空串 = 删掉这个自建字段键（与 setFields 的语义一致）
          await writer.setCustom(kind, id, customPatch)
        }
        const receipt = await receiptOf(writer, kind, id, [...columnKeys, ...customKeys])
        // 写完读回来给模型看：它得知道盘上现在是什么，而不是自己以为写了什么。
        // 正文不重复回放（那是回执与 set_body 的事），省下的正是复利开销。
        const after = await capabilities.getEntity(AGENT_CALLER, kind, id)
        const parts = [
          columnKeys.length > 0 ? `内置字段 ${columnKeys.join('、')}` : '',
          customKeys.length > 0 ? `自建字段 ${customKeys.join('、')}` : '',
        ].filter(Boolean)
        const rejectedNote =
          rejected.length > 0
            ? `\n没写：\n${rejected.map((item) => `- [${item.code}] ${item.key}：${item.note}`).join('\n')}${declaredNote}`
            : ''
        return finish(
          ok(
            `已写入 ${parts.join(' / ')}。${receiptBlock(receipt)}\n\n现在这条是：\n\n${capabilities.buildCodexSlice(after, { omitBody: true })}${rejectedNote}`,
            {
              written: [...columnKeys, ...customKeys],
              columns: columnKeys,
              custom: customKeys,
              rejected,
            },
          ),
        )
      }

      if (name === 'library_set_body') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        if (typeof args.body !== 'string') return finish(fail('body 必须是 Markdown 字符串。'))
        const markdown = args.body.trim()
        if (markdown === '') {
          return finish(fail('body 是空的。不想改正文就别调这个工具。'))
        }
        if (markdown.length > BODY_MAX_LENGTH) {
          return finish(fail(`正文太长（${markdown.length} 字，上限 ${BODY_MAX_LENGTH}）。`))
        }
        // 先确认这条存在：Dexie 的 update 对不存在的 id 是静默成功，
        // 不挡就会回一句「已写入」而盘上什么都没变。
        const target = await capabilities.getEntity(AGENT_CALLER, kind, id)
        await writer.setBody(kind, id, markdown)
        const receipt = await receiptOf(writer, kind, id, ['body'])
        return finish(
          ok(
            `已替换《${target.title}》的正文（${markdown.length} 字，整篇覆盖）。${receiptBlock(receipt)}`,
            { length: markdown.length },
          ),
        )
      }

      const hops = numberOf(args.hops, 1, 1, 2)
      const entries = await capabilities.graphSlice(AGENT_CALLER, kind, id, hops)
      const body = entries.map((entry) => capabilities.buildCodexSlice(entry)).join('\n\n---\n\n')
      return finish(ok(`围绕${KIND_LABEL[kind]} #${id} 取到 ${entries.length} 条：\n\n${body}`, entries))
    } catch (error) {
      // 能力层抛的是「找不到 / 权限不够」这类可读错误，交给模型自己纠正
      return finish(fail(error instanceof Error ? error.message : String(error)))
    }
  }
}
