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
import type { createCapabilities } from './index'

type Capabilities = ReturnType<typeof createCapabilities>

/** 助手这个调用方在库里的身份 —— journal 与审计都靠它认人 */
export const AGENT_CALLER = { actor: 'agent:assistant', permissions: READ_PERMISSION } as const

export const LIBRARY_TOOL_NAMES = [
  'library_list',
  'library_read',
  'library_search',
  'library_graph',
  'library_set_fields',
  'library_set_body',
  'library_link',
  'library_create',
  'library_delete',
  'library_set_tags',
  'library_set_custom',
  'library_set_media',
  'library_rename',
  'library_set_placement',
  'library_create_category',
  'library_set_novel',
  'library_import_image',
] as const

export type LibraryToolName = (typeof LIBRARY_TOOL_NAMES)[number]

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
  // 词条：一行简介 / 章节大纲；小说专属字段走 `library_set_novel`
  world: ['summary', 'chapterOutline'],
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

const FIELD_MAX_LENGTH = 4000

/** 正文上限：比字段宽得多，但挡住「模型一口气吐一万字」这种事故 */
const BODY_MAX_LENGTH = 20_000

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

/** 写库动作：注入进来，执行器本身不碰 Dexie（脚本里也能跑） */
export interface LibraryWriter {
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

function summaryLine(row: { kind: EntityKind; id: number; title: string; aliases: string[]; tags: string[] }): string {
  const extras = [row.aliases.length > 0 ? `别名 ${row.aliases.join('、')}` : '', row.tags.length > 0 ? `标签 ${row.tags.join('、')}` : '']
    .filter(Boolean)
    .join(' · ')
  return `- [${KIND_LABEL[row.kind]} #${row.id}] ${row.title}${extras ? `（${extras}）` : ''}`
}

/**
 * 造一个「先问宿主、宿主不认识就交回插件」的执行器。
 *
 * 返回 `null` 表示这个名字不归宿主管，调用方继续走原来的路径（插件的 Rust
 * 文件工具）；返回结果就表示已经处理完。
 */
export function createLibraryToolExecutor(capabilities: Capabilities, writer?: LibraryWriter) {
  return async function resolveLibraryTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult | null> {
    if (!(LIBRARY_TOOL_NAMES as readonly string[]).includes(name)) return null

    const started = Date.now()
    const finish = (result: ToolResult): ToolResult => ({ ...result, durationMs: Date.now() - started })

    try {
      if (name === 'library_list') {
        const asked = kindOf(args.kind)
        const limit = numberOf(args.limit, 40, 1, 200)
        if (asked) {
          const rows = await capabilities.listEntities(AGENT_CALLER, asked, limit)
          if (rows.length === 0) return finish(ok(`库里还没有${KIND_LABEL[asked]}。`))
          return finish(
            ok(
              `${KIND_LABEL[asked]}共列出 ${rows.length} 条（最近改动在前）：\n${rows.map(summaryLine).join('\n')}`,
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

      if (name === 'library_read') {
        const kind = kindOf(args.kind)
        if (!kind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const id = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (id < 0) return finish(fail('需要实体 id。先用 library_list 或 library_search 拿到它。'))
        const entry = await capabilities.getEntity(AGENT_CALLER, kind, id)
        return finish(ok(capabilities.buildCodexSlice(entry), entry))
      }

      if (name === 'library_search') {
        const query = textOf(args.query)
        if (query === '') return finish(fail('query 不能为空。'))
        const limit = numberOf(args.limit, 20, 1, 50)
        const rows = await capabilities.search(AGENT_CALLER, query, limit)
        if (rows.length === 0) return finish(ok(`没有匹配「${query}」的条目。`))
        return finish(ok(`匹配「${query}」${rows.length} 条：\n${rows.map(summaryLine).join('\n')}`, rows))
      }

      // library_create：新建条目（走各 feature 的 create*，不手拼行）
      if (name === 'library_create') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const createKind = kindOf(args.kind)
        if (!createKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const title = textOf(args.title).slice(0, TITLE_MAX_LENGTH)
        if (title === '') return finish(fail('title 不能为空。'))
        const writable: readonly string[] = WRITABLE_FIELDS[createKind]
        const fields: Record<string, string> = {}
        if (args.fields !== undefined && args.fields !== null) {
          if (typeof args.fields !== 'object' || Array.isArray(args.fields)) {
            return finish(fail('fields 必须是一个对象，键是要填的字段名。'))
          }
          for (const [key, value] of Object.entries(args.fields as Record<string, unknown>)) {
            if (!writable.includes(key)) continue
            fields[key] = textOf(value).slice(0, FIELD_MAX_LENGTH)
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
        return finish(
          ok(
            `已新建${KIND_LABEL[createKind]}「${created.title}」（#${newId}）。\n\n${capabilities.buildCodexSlice(created)}`,
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

      // library_set_tags：按名字打标签（没有就建）
      if (name === 'library_set_tags') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const tagKind = kindOf(args.kind)
        if (!tagKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const tagId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (tagId < 0) return finish(fail('需要实体 id。'))
        if (!Array.isArray(args.tags)) return finish(fail('tags 必须是字符串数组。'))
        const names: string[] = []
        for (const item of args.tags) {
          if (typeof item !== 'string') continue
          const name = item.trim().slice(0, 30)
          if (name !== '' && !names.includes(name)) names.push(name)
          if (names.length >= 20) break
        }
        const tags = await writer.setTags(tagKind, tagId, names)
        const now = tags.length > 0 ? tags.map((tag) => tag.name).join('、') : '（已清空）'
        return finish(ok(`已给${KIND_LABEL[tagKind]} #${tagId} 打上：${now}`, { tags }))
      }

      // library_set_custom：合并写自建字段（模板 / 字段组用）
      if (name === 'library_set_custom') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const customKind = kindOf(args.kind)
        if (!customKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const customId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (customId < 0) return finish(fail('需要实体 id。'))
        const raw = args.fields
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          return finish(fail('fields 必须是一个对象（键 = 字段键，值 = 文本）。'))
        }
        const patch: Record<string, string> = {}
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          const name = key.trim().slice(0, 60)
          if (name === '') continue
          patch[name] = textOf(value).slice(0, FIELD_MAX_LENGTH)
          if (Object.keys(patch).length >= 40) break
        }
        const keys = Object.keys(patch)
        if (keys.length === 0) return finish(fail('fields 是空的。'))
        await writer.setCustom(customKind, customId, patch)
        return finish(ok(`已写入自建字段：${keys.join('、')}`, { written: keys }))
      }

      // library_set_media：写图片槽位（文件必须先在库里）
      if (name === 'library_set_media') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const mediaKind = kindOf(args.kind)
        if (!mediaKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const mediaId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (mediaId < 0) return finish(fail('需要实体 id。'))
        const slot = textOf(args.slot) as MediaSlot
        if (!MEDIA_SLOTS[mediaKind].includes(slot)) {
          return finish(fail(`${KIND_LABEL[mediaKind]}的图片槽位只有：${MEDIA_SLOTS[mediaKind].join(' / ')}。`))
        }
        const path = textOf(args.path).replace(/\\/g, '/').slice(0, 500)
        if (path === '') return finish(fail('path 不能为空。'))
        if (/^[a-zA-Z]:|^\//.test(path) || path.split('/').includes('..')) {
          return finish(fail('path 必须是库内相对路径，不能是绝对路径或带 ..。'))
        }
        await writer.setMedia(mediaKind, mediaId, slot, path)
        return finish(ok(`已设置${KIND_LABEL[mediaKind]} #${mediaId} 的 ${slot}：${path}`, { slot, path }))
      }

      // library_import_image：下载 URL 到附件/，再写槽位
      if (name === 'library_import_image') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const imageKind = kindOf(args.kind)
        if (!imageKind) return finish(fail('kind 必须是 character / event / country / world 之一。'))
        const imageId = numberOf(args.id, -1, 0, Number.MAX_SAFE_INTEGER)
        if (imageId < 0) return finish(fail('需要实体 id。'))
        const slot = textOf(args.slot) as MediaSlot
        if (!MEDIA_SLOTS[imageKind].includes(slot)) {
          return finish(fail(`${KIND_LABEL[imageKind]}的图片槽位只有：${MEDIA_SLOTS[imageKind].join(' / ')}。`))
        }
        const url = textOf(args.url).slice(0, 2000)
        if (!/^https?:\/\//i.test(url)) return finish(fail('url 必须是 http(s) 地址。'))
        const filename = textOf(args.filename).slice(0, 80)
        const saved = await writer.importImage(
          imageKind,
          imageId,
          slot,
          url,
          filename === '' ? undefined : filename,
        )
        return finish(
          ok(`已把图片下载到「${saved.path}」并设为${KIND_LABEL[imageKind]} #${imageId} 的 ${slot}。`, saved),
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
        return finish(
          ok(
            `已把${KIND_LABEL[renameKind]} #${renameId} 改名为「${title}」${
              aliases ? `，别名 ${aliases.length} 个` : ''
            }。`,
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
        return finish(ok(`已更新词条 #${placeId} 的归类。`, placement))
      }

      // library_create_category：新建自定义分类（可选一键带字段组 + 模板）
      if (name === 'library_create_category') {
        if (!writer) return finish(fail('这个环境不能写库。'))
        const categoryName = textOf(args.name).slice(0, 40)
        if (categoryName === '') return finish(fail('分类名不能为空。'))
        const template = textOf(args.template).slice(0, 60)
        const icon = textOf(args.icon).slice(0, 40)
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
        const writable: readonly string[] = WRITABLE_FIELDS[kind]
        if (writable.length === 0) return finish(fail(`${KIND_LABEL[kind]}没有可写的标量字段。`))
        const raw = args.fields
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          return finish(fail('fields 必须是一个对象，键是要改的字段名。'))
        }
        const patch: Record<string, string> = {}
        const rejected: string[] = []
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          if (!writable.includes(key)) {
            rejected.push(key)
            continue
          }
          const text = textOf(value).slice(0, FIELD_MAX_LENGTH)
          patch[key] = text
        }
        const keys = Object.keys(patch)
        if (keys.length === 0) {
          return finish(
            fail(
              rejected.length > 0
                ? `这些字段不能写：${rejected.join('、')}。可写的是 ${writable.join(' / ')}。`
                : 'fields 是空的。',
            ),
          )
        }
        await writer.setFields(kind, id, patch)
        // 写完读回来给模型看：它得知道盘上现在是什么，而不是自己以为写了什么
        const after = await capabilities.getEntity(AGENT_CALLER, kind, id)
        return finish(
          ok(`已写入 ${keys.join('、')}。现在这条是：\n\n${capabilities.buildCodexSlice(after)}`, {
            written: keys,
            rejected,
          }),
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
        await writer.setBody(kind, id, markdown)
        const after = await capabilities.getEntity(AGENT_CALLER, kind, id)
        const body = after.body.trim()
        return finish(
          ok(
            `已替换正文（${markdown.length} 字）。读回来是：\n\n${body.length > 0 ? body : '（空）'}`,
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
