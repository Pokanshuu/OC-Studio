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
const WRITABLE_FIELDS = {
  character: ['race', 'element', 'occupation', 'faction', 'height', 'birthday', 'bio'],
  event: ['time', 'endTime', 'location', 'summary'],
  country: ['description', 'system', 'geography', 'culture'],
  world: [],
} as const satisfies Record<EntityKind, readonly string[]>

const FIELD_MAX_LENGTH = 4000

/** 正文上限：比字段宽得多，但挡住「模型一口气吐一万字」这种事故 */
const BODY_MAX_LENGTH = 20_000

/** 关系标签长度上限：`同门` / `宿敌` 这种，不该是一段话 */
const RELATION_MAX_LENGTH = 40

/**
 * 允许建的关系边 —— **只收"真源在发起方"的那三种**（`AGENTS.md` 的成员关系单向原则）。
 *
 * 国家页的「相关角色 / 相关事件」是查询，不是存储；所以这里没有 country → character，
 * 只有 character → country（写 `countryId`，也就是国籍）。多写一份镜像就是又一个会漂的真源。
 */
const LINKABLE: readonly string[] = [
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
}

const KINDS: readonly EntityKind[] = ['character', 'event', 'country', 'world']

const KIND_LABEL: Record<EntityKind, string> = {
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
