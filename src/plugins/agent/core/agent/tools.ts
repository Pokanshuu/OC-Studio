/**
 * The agent's tool belt.
 *
 * The **schemas live here** (they are part of the prompt: the model reads them),
 * the **execution lives in Rust** (`src-tauri/src/tools.rs`) or the host
 * (`src/lib/capabilities/agent-tools.ts`), and the SDK-style ergonomics live in
 * `agent/loop.ts`.
 *
 * ⚠️ **Every character here is charged on every request.** Descriptions are one
 * or two sentences: trigger ("when to use this"), the one non-obvious rule, and
 * nothing that the capability cards already say. The previous version repeated
 * the whole field table / slot list in three places and cost ~19k characters
 * (≈4.8k tokens) per turn — see `scripts/agent-budget-check.ts`.
 *
 * Descriptions are in English because tool-calling quality is measurably better
 * with the schemas most models were trained on; the UI labels are localised.
 */

import type { ToolCall } from '../types'

export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolSpec {
  name: string
  description: string
  parameters: JsonSchema
  /** Shows an approval dialog before the call runs (default `true`). */
  requiresApproval: boolean
  category: 'read' | 'write' | 'exec' | 'net' | 'meta'
}

const pathProp = {
  type: 'string',
  description: 'Path relative to the workspace root.',
}

const entityKindProp = {
  type: 'string',
  enum: ['character', 'event', 'country', 'world'],
  description: 'Entity kind.',
}

const entityIdProp = { type: 'integer', description: 'Entity id.' }

const okRead = { requiresApproval: false, category: 'read' as const }
const okWrite = { requiresApproval: true, category: 'write' as const }

export const ALL_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    ...okRead,
    description: 'Read a UTF-8 file with line numbers. Use offset/limit to page through big files.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        offset: { type: 'integer', description: 'Zero-based first line.' },
        limit: { type: 'integer', description: 'Max lines (default 600, max 2000).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    ...okWrite,
    description: 'Create or overwrite a file. Prefer edit_file for existing files.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        content: { type: 'string', description: 'Full file content.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_file',
    ...okWrite,
    description: 'Replace an exact, unique string in an existing file.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        old_string: { type: 'string', description: 'Exact text to replace.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence.' },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_dir',
    ...okRead,
    description: 'List a directory tree, `depth` levels deep.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        depth: { type: 'integer', description: 'Recursion depth (default 2, max 4).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'glob',
    ...okRead,
    description: 'Find files by glob pattern, e.g. `**/*.ts`.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern; `**` crosses directories.' },
        path: { type: 'string', description: 'Directory to search from (default: root).' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'grep',
    ...okRead,
    description: 'Search file contents with a regex; returns `path:line: text` hits.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Rust regex syntax.' },
        path: { type: 'string', description: 'Directory to search from (default: root).' },
        include: { type: 'string', description: 'Only files matching this glob.' },
        case_sensitive: { type: 'boolean', description: 'Default false.' },
        max_results: { type: 'integer', description: 'Default 30, max 200.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_shell',
    category: 'exec',
    requiresApproval: true,
    description: 'Run a shell command in the workspace (cmd / sh). Use file tools for inspection.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command line to run.' },
        cwd: { type: 'string', description: 'Working directory inside the workspace.' },
        timeout_ms: { type: 'integer', description: 'Default 60000, max 300000.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    name: 'fetch_url',
    category: 'net',
    requiresApproval: true,
    description: 'Fetch an http(s) URL as plain text (HTML stripped).',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Absolute http(s) URL.' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'todo_write',
    category: 'meta',
    requiresApproval: false,
    description: 'Track a multi-step job. Send the full list; `[]` clears it.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The complete list, not a delta.',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
      additionalProperties: false,
    },
  },
  // ── OC Studio 宿主注入：设定库接口 ─────────────────────────────────────
  // 这些由宿主执行（`src/lib/capabilities/agent-tools.ts`），不走 Rust 文件层。
  {
    name: 'library_list',
    ...okRead,
    description:
      'List library entries (characters, events, countries, lore). Omit `kind` for counts. ' +
      'Filters: `category`, `tag`, `isMajor`.',
    parameters: {
      type: 'object',
      properties: {
        kind: { ...entityKindProp, description: 'Entity kind; omit for an overview.' },
        limit: { type: 'integer', description: 'Max rows per kind (default 40, max 200).' },
        category: { type: 'string', description: 'world: exact category name.' },
        tag: { type: 'string', description: 'Exact tag name.' },
        isMajor: { type: 'boolean', description: 'character: only major entries.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'library_read',
    ...okRead,
    description:
      'Read one entry: fields, relations, events, tags and body. Body is clipped to 4k chars ' +
      'unless `include_body`. Ends with writable fields and template-declared keys.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        include_body: { type: 'boolean', description: 'Return the full body (default false).' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_search',
    ...okRead,
    description:
      'Search titles, aliases, tags and body — use it to check for duplicates or established canon.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title, alias, tag or body fragment.' },
        limit: { type: 'integer', description: 'Max hits (default 20, max 50).' },
        include_body: { type: 'boolean', description: 'Scan body too (default true).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_graph',
    ...okRead,
    description: 'Walk the relation graph around one entry (1–2 hops), including related events.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        hops: { type: 'integer', description: '1 or 2 (default 1).' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_templates',
    ...okRead,
    description:
      'List templates, categories and info-group fields (key + label). Read before writing custom fields.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'library_set_fields',
    ...okWrite,
    description:
      'Write scalar fields of one entry (built-in columns and existing custom keys alike). ' +
      'Unknown keys are rejected unless `create_new`; an empty string clears a field.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        fields: {
          type: 'object',
          description:
            'Key → text. Built-in: character race/element/occupation/faction/height/birthday/bio; ' +
            'event time/endTime/location/summary; country description/system/geography/culture; ' +
            'world summary/time/endTime/location/chapterOutline. Any other key must exist on the ' +
            'entry or be declared by its template / field config.',
          additionalProperties: { type: 'string' },
        },
        create_new: { type: 'boolean', description: 'Allow new custom keys (default false).' },
      },
      required: ['kind', 'id', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_body',
    ...okWrite,
    description:
      "Replace an entry's body with Markdown (whole document; read it first). `[[Title]]` links resolve.",
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        body: { type: 'string', description: 'Full body as Markdown.' },
      },
      required: ['kind', 'id', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_link',
    ...okWrite,
    description: 'Link two entries; the from side owns the edge. Idempotent.',
    parameters: {
      type: 'object',
      properties: {
        from: { ...entityKindProp, description: 'Kind of the entry owning the link.' },
        fromId: entityIdProp,
        to: { ...entityKindProp, description: 'Kind of the entry pointed at.' },
        toId: entityIdProp,
        relation: {
          type: 'string',
          description: 'Short label, e.g. 同门 / 宿敌. Ignored for nationality.',
        },
      },
      required: ['from', 'fromId', 'to', 'toId', 'relation'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_create',
    ...okWrite,
    description:
      'Create an entry and return its id. An existing same-title entry is returned instead. ' +
      'Add body and links with the dedicated tools.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        title: { type: 'string', description: 'Title (or name, for characters and countries).' },
        fields: {
          type: 'object',
          description: 'Optional scalar fields (same whitelist as library_set_fields).',
          additionalProperties: { type: 'string' },
        },
        category: {
          type: 'string',
          description: 'world: category name (e.g. 宠物, 小说).',
        },
        template: { type: 'string', description: 'world: template name; normally follows category.' },
        parentId: { type: 'integer', description: 'world: parent entry id.' },
      },
      required: ['kind', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_delete',
    ...okWrite,
    description:
      'Move one entry to the trash (soft delete, recoverable). Never delete files or run rm / del.',
    parameters: {
      type: 'object',
      properties: { kind: entityKindProp, id: entityIdProp },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_tags',
    ...okWrite,
    description:
      'Replace tags by name (missing names are created; an empty array clears). Use `ids` to tag up to 50 at once.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: { type: 'integer', description: 'Single entity id.' },
        ids: { type: 'array', items: { type: 'integer' }, description: 'Batch ids (max 50).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tag names (max 20).' },
      },
      required: ['kind', 'tags'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_media',
    ...okWrite,
    description:
      'Set an image slot from `url` (downloaded into 附件/) or a library-relative `path`. ' +
      'Slots: character avatar/header; event header; country flag/header; world cover/avatar/image/novelCover.',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        slot: {
          type: 'string',
          enum: ['avatar', 'header', 'flag', 'cover', 'image', 'novelCover'],
          description: 'Slot; not every kind has every slot.',
        },
        url: { type: 'string', description: 'http(s) image URL to download.' },
        path: { type: 'string', description: 'Existing library path, e.g. 附件/forest.png.' },
        filename: { type: 'string', description: 'Optional file name when downloading.' },
      },
      required: ['kind', 'id', 'slot'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_rename',
    ...okWrite,
    description:
      'Rename an entry; wiki-link labels are updated. Optionally replace its aliases ([] clears).',
    parameters: {
      type: 'object',
      properties: {
        kind: entityKindProp,
        id: entityIdProp,
        title: { type: 'string', description: 'New title (or name for characters / countries).' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Full alias list (max 20); [] clears.',
        },
      },
      required: ['kind', 'id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_placement',
    ...okWrite,
    description:
      'world only: move to a category, switch template, or change parent. Empty string clears; ' +
      'parentId null = root. Categories / templates are created by the author in the UI.',
    parameters: {
      type: 'object',
      properties: {
        kind: { ...entityKindProp, description: 'Must be world.' },
        id: entityIdProp,
        category: { type: 'string', description: 'Category name, or "" to clear.' },
        template: { type: 'string', description: 'Template name, or "" to follow the category.' },
        parentId: { type: ['integer', 'null'], description: 'Parent note id, or null for root.' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_create_category',
    ...okWrite,
    description:
      'Create a category (optionally with info group + note template). Never use a built-in directory ' +
      'name (小说/地图/角色/事件/国家/词条/世界观): those notes already have their own page.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Category name (also the note `category` value).' },
        template: { type: 'string', description: 'Existing template to bind (e.g. 词条).' },
        icon: { type: 'string', description: 'Icon name, e.g. sparkles / leaf / flaskConical.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field keys (max 30); creates an info group + template.',
        },
        labels: {
          type: 'object',
          description: 'Field key → display name.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_novel',
    ...okWrite,
    description:
      'Set the work info of a novel root (a world entry with category 小说): author, synopsis, ' +
      'target word count, notes and cover path. Chapters are notes with parentId = root.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Novel root entry id.' },
        author: { type: 'string', description: 'Author.' },
        synopsis: { type: 'string', description: 'Work synopsis.' },
        targetWords: { type: 'integer', description: 'Target word count.' },
        notes: { type: 'string', description: 'Work notes.' },
        cover: { type: 'string', description: 'Cover image path inside the library.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'novel_write_chapter',
    ...okWrite,
    description:
      'Write a chapter in the novel selected for this creative conversation. Without `chapterId` ' +
      'it creates a NEW chapter; pass `chapterId` to rewrite that chapter. Only when the author ' +
      'enabled write-back.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Chapter title (ignored when rewriting).' },
        markdown: { type: 'string', description: 'Chapter body in Markdown.' },
        chapterId: { type: 'integer', description: 'Existing chapter id to rewrite.' },
      },
      required: ['markdown'],
      additionalProperties: false,
    },
  },
]

export const TOOL_NAMES = ALL_TOOLS.map((t) => t.name)

export function toolByName(name: string): ToolSpec | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}

export function toolsFor(enabled: string[]): ToolSpec[] {
  const set = new Set(enabled)
  return ALL_TOOLS.filter((t) => set.has(t.name))
}

/** OpenAI `tools` array. */
export function toOpenAiTools(specs: ToolSpec[]): Array<Record<string, unknown>> {
  return specs.map((spec) => ({
    type: 'function',
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  }))
}

/** Best-effort parse of the model's JSON arguments. */
export function parseToolArgs(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * `{...}` streaming arguments are unusable until complete, so a broken string is
 * kept verbatim for display but summarised defensively.
 */
export function toolSummary(call: ToolCall): string {
  const args = parseToolArgs(call.args)
  const pick = (key: string): string | undefined => {
    const value = args[key]
    return typeof value === 'string' ? value : undefined
  }
  switch (call.name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'list_dir':
      return pick('path') ?? ''
    case 'glob':
      return pick('pattern') ?? ''
    case 'grep':
      return pick('pattern') ?? ''
    case 'run_shell':
      return pick('command') ?? ''
    case 'fetch_url':
      return pick('url') ?? ''
    case 'todo_write': {
      const todos = args.todos
      return Array.isArray(todos) ? `${todos.length} 项` : ''
    }
    case 'library_list':
      return typeof args.kind === 'string' ? args.kind : '全部'
    case 'library_read':
    case 'library_graph':
      return typeof args.kind === 'string' && typeof args.id === 'number' ? `${args.kind} #${args.id}` : ''
    case 'library_set_fields': {
      const fields = args.fields
      if (fields === null || typeof fields !== 'object') return ''
      const keys = Object.keys(fields as Record<string, unknown>)
      return keys.length > 0 ? keys.join(' · ') : ''
    }
    case 'library_set_body':
      return typeof args.body === 'string' ? `${args.body.length} 字` : ''
    case 'library_link':
      return typeof args.relation === 'string' && typeof args.toId === 'number'
        ? `${args.relation} → #${args.toId}`
        : ''
    case 'library_create':
      return typeof args.title === 'string' ? `新${typeof args.kind === 'string' ? args.kind : '条目'} · ${args.title}` : ''
    case 'library_delete':
      return typeof args.kind === 'string' && typeof args.id === 'number' ? `${args.kind} #${args.id}` : ''
    case 'library_set_tags': {
      const count = Array.isArray(args.ids) ? args.ids.length : 1
      const tags = Array.isArray(args.tags) ? `${args.tags.length} 个标签` : '标签'
      return count > 1 ? `${count} 条 · ${tags}` : tags
    }
    case 'library_set_media':
      return typeof args.slot === 'string' ? args.slot : ''
    case 'library_templates':
      return '模板目录'
    case 'library_rename':
      return pick('title') ?? ''
    case 'library_create_category':
      return pick('name') ?? ''
    case 'library_set_novel':
      return typeof args.id === 'number' ? `#${args.id}` : ''
    case 'library_set_placement': {
      const parts: string[] = []
      if (typeof args.category === 'string' && args.category !== '') parts.push(args.category)
      if (typeof args.template === 'string' && args.template !== '') parts.push(args.template)
      if (typeof args.parentId === 'number') parts.push(`#${args.parentId}`)
      return parts.join(' · ')
    }
    case 'novel_write_chapter':
      return typeof args.title === 'string' ? args.title : ''
    case 'library_search':
      return pick('query') ?? ''
    default:
      return ''
  }
}
