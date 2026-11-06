/**
 * The agent's tool belt.
 *
 * The **schemas live here** (they are part of the prompt: the model reads them),
 * the **execution lives in Rust** (`src-tauri/src/tools.rs`), and the SDK-style
 * ergonomics live in `agent/loop.ts`. Keeping the three apart means a tool can be
 * renamed or re-described without touching filesystem code.
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
  description: 'Path relative to the workspace root. Absolute paths must stay inside it.',
}

export const ALL_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    category: 'read',
    requiresApproval: false,
    description:
      'Read a UTF-8 text file from the workspace. Returns the content with line numbers, ' +
      'so you can quote exact line references. Use `offset`/`limit` to page through big files.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        offset: { type: 'integer', description: 'Zero-based line to start at.' },
        limit: { type: 'integer', description: 'Max lines to return (default 600, max 2000).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    category: 'write',
    requiresApproval: true,
    description:
      'Create a file or overwrite an existing one with the given content. Always prefer ' +
      '`edit_file` for small changes to existing files.',
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
    category: 'write',
    requiresApproval: true,
    description:
      'Replace an exact string in a file. `old_string` must match the file byte for byte, ' +
      'including indentation, and must be unique unless `replace_all` is true.',
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
    category: 'read',
    requiresApproval: false,
    description: 'List the contents of a directory, recursively up to `depth` levels.',
    parameters: {
      type: 'object',
      properties: {
        path: pathProp,
        depth: { type: 'integer', description: 'Recursion depth, default 2 (max 4).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'glob',
    category: 'read',
    requiresApproval: false,
    description:
      'Find files by glob pattern, e.g. `**/*.ts` or `src/**/*.{json,yml}`. ' +
      'Returns workspace-relative paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern; `**` crosses directories.' },
        path: { type: 'string', description: 'Directory to search from (default: workspace root).' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'grep',
    category: 'read',
    requiresApproval: false,
    description:
      'Search file contents with a regular expression. Returns `path:line: text` hits. ' +
      'Use it to locate code before reading it.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Rust regex syntax.' },
        path: { type: 'string', description: 'Directory to search from (default: workspace root).' },
        include: { type: 'string', description: 'Only search files matching this glob.' },
        case_sensitive: { type: 'boolean', description: 'Default false.' },
        max_results: { type: 'integer', description: 'Default 80, max 400.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_shell',
    category: 'exec',
    requiresApproval: true,
    description:
      'Run a shell command in the workspace (cmd /c on Windows, sh -lc elsewhere). ' +
      'Returns combined stdout/stderr and the exit code. Prefer reading files over ' +
      'using shell commands for inspection.',
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
    description: 'Fetch an http(s) URL and return it as plain text (HTML is stripped).',
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
    description:
      'Record the task list for a multi-step job. Use it to keep the plan visible and ' +
      'to mark progress. Sending an empty list clears it.',
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
  // ── OC Studio 宿主注入：设定库只读接口 ────────────────────────────────
  // 这四个由宿主执行（`src/lib/capabilities/agent-tools.ts`），不走 Rust 文件层。
  // 它们回答的是「这套设定里有什么」，比翻文件夹更接近作者真正想问的事。
  {
    name: 'library_list',
    category: 'read',
    requiresApproval: false,
    description:
      "List entries in the author's worldbuilding library (characters, events, countries, " +
      'lore entries). Omit `kind` for an overview with counts. Newest edits first. ' +
      'Filter with `category` (lore notes only, e.g. 宠物 / 小说), `tag` (exact tag name) or ' +
      '`isMajor` (characters only) instead of listing everything and counting yourself.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind to list. Omit for an overview of all four.',
        },
        limit: { type: 'integer', description: 'Max rows per kind (default 40, max 200).' },
        category: {
          type: 'string',
          description: 'world only: exact category name. Filters before the limit is applied.',
        },
        tag: { type: 'string', description: 'Exact tag name, e.g. 主角.' },
        isMajor: { type: 'boolean', description: 'character only: only entries marked as major.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'library_read',
    category: 'read',
    requiresApproval: false,
    description:
      'Read one library entry in full: fields, relations, related events in time order, ' +
      'tags and body text, rendered as Markdown. Get the id from library_list or library_search.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id, as shown in library_list.' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_search',
    category: 'read',
    requiresApproval: false,
    description:
      'Search the library by title, alias, tag name **and body text** — use this to check ' +
      '"did I already write this setting somewhere". Hits found only in the body are marked. ' +
      'Pass include_body: false to match titles / aliases / tags only.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title, alias, tag or body fragment.' },
        limit: { type: 'integer', description: 'Max hits (default 20, max 50).' },
        include_body: {
          type: 'boolean',
          description: 'Scan body text too (default true). Set false for name-only search.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_graph',
    category: 'read',
    requiresApproval: false,
    description:
      'Walk the relationship graph around one entry for one or two hops. Related events count ' +
      'as a hop, so this is the best way to ask "what happened to this character".',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        hops: { type: 'integer', description: 'How many hops (1 or 2, default 1).' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_templates',
    category: 'read',
    requiresApproval: false,
    description:
      'Describe the library catalogue: every template with its enabled components and the info-group ' +
      'fields it uses (key + display name), plus which template each category is bound to. Read this ' +
      'before writing custom fields — the keys you need are listed here.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'library_set_fields',
    category: 'write',
    requiresApproval: true,
    description:
      "Update text fields of one library entry. Built-in columns (a character's race / occupation / " +
      'faction, an event\'s location, …) and the entry\'s own custom fields are both handled here — ' +
      'you do not need a second tool and you do not need to know which is which: a key that matches a ' +
      'built-in column is written there (that always wins), any other known custom key goes to the ' +
      'custom field map. Read the entry first (library_read) to see its custom keys. Unknown keys are ' +
      'rejected unless you pass create_new: true. Does not touch body text and does not rename.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        fields: {
          type: 'object',
          description:
            'Key → new text. Built-in keys: characters race / element / occupation / faction / ' +
            'height / birthday / bio; events time / endTime / location / summary; countries ' +
            'description / system / geography / culture; lore summary / chapterOutline. ' +
            'Any other key must already exist on the entry (see library_read), or pass create_new. ' +
            'An empty string clears the field.',
          additionalProperties: { type: 'string' },
        },
        create_new: {
          type: 'boolean',
          description: 'Allow writing custom keys that do not exist yet (default false).',
        },
      },
      required: ['kind', 'id', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_body',
    category: 'write',
    requiresApproval: true,
    description:
      'Replace the body text of one library entry with the given Markdown. This overwrites ' +
      'whatever is there now, so read the entry first and keep what still holds. ' +
      'Wiki links written as [[Title]] are resolved against the library.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        body: { type: 'string', description: 'Full body as Markdown. Must not be empty.' },
      },
      required: ['kind', 'id', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_link',
    category: 'write',
    requiresApproval: true,
    description:
      'Record a relationship between two existing entries: character→character, character→country ' +
      '(nationality), event→character (participant) or event→country. The link is stored on the ' +
      'from side only. Idempotent: linking the same pair twice is a no-op.',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Kind of the entry that owns the link (the "from" side).',
        },
        fromId: { type: 'integer', description: 'From entity id.' },
        to: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Kind of the entry being pointed at.',
        },
        toId: { type: 'integer', description: 'To entity id.' },
        relation: {
          type: 'string',
          description: 'Short label, e.g. 同门 / 宿敌 / 师承. Ignored for nationality links.',
        },
      },
      required: ['from', 'fromId', 'to', 'toId', 'relation'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_create',
    category: 'write',
    requiresApproval: true,
    description:
      'Create a new library entry of the given kind and return it. Only the title and the whitelisted ' +
      'scalar fields can be set here; add the body afterwards with library_set_body and connections ' +
      'with library_link. For world entries (lore notes) you may also pass category / template / ' +
      'parentId to place it in a custom category, a novel (category=小说) or under a parent note.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind to create.',
        },
        title: { type: 'string', description: 'Title (or name, for characters and countries).' },
        fields: {
          type: 'object',
          description: 'Optional scalar fields, same whitelist as library_set_fields.',
          additionalProperties: { type: 'string' },
        },
        category: {
          type: 'string',
          description:
            'world only: category name from the library catalog (e.g. 宠物, or 小说 for a novel root). ' +
            'Omit for a plain lore entry.',
        },
        template: {
          type: 'string',
          description: 'world only: template name; normally follows the category.',
        },
        parentId: {
          type: 'integer',
          description: 'world only: parent entry id (e.g. a novel chapter points at its novel root).',
        },
      },
      required: ['kind', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_delete',
    category: 'write',
    requiresApproval: true,
    description:
      'Move one library entry to the trash (soft delete, recoverable). Use this instead of deleting ' +
      'files or running rm / del / Remove-Item. Only remove entries the user asked to remove, or an ' +
      'entry you just created by mistake.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_tags',
    category: 'write',
    requiresApproval: true,
    description:
      'Replace the tags of library entries with the given names. Pass `id` for one entry or `ids` ' +
      'to tag many at once (max 50) — bulk tagging takes one call, not one call per entry. Names are ' +
      'matched exactly; names that do not exist yet are created. An empty array clears every tag.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Single entity id.' },
        ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Batch: entity ids (max 50). Use instead of id.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag names (max 20). Empty array clears the tags.',
        },
      },
      required: ['kind', 'tags'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_media',
    category: 'write',
    requiresApproval: true,
    description:
      'Set an image slot of one entry. Give `url` and the host downloads it into the library folder ' +
      '(附件/, done in Rust, no CORS, max 20 MB, png/jpg/jpeg/webp/gif/avif, never overwrites). Give ' +
      '`path` instead when the file is already inside the library (vault-relative, e.g. 附件/forest.png). ' +
      'Slots: character avatar/header, event header, country flag/header, world cover/avatar/image/novelCover.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        slot: {
          type: 'string',
          enum: ['avatar', 'header', 'flag', 'cover', 'image', 'novelCover'],
          description: 'Image slot. Not every slot exists on every kind; see the description.',
        },
        url: { type: 'string', description: 'Absolute http(s) image URL to download.' },
        path: {
          type: 'string',
          description: 'Vault-relative path of an existing file, e.g. 附件/forest.png.',
        },
        filename: {
          type: 'string',
          description: 'With url: optional target file name (allowed image extension).',
        },
      },
      required: ['kind', 'id', 'slot'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_rename',
    category: 'write',
    requiresApproval: true,
    description:
      'Rename one entry. The title change goes through the normal rename path, so wiki-link labels ' +
      'pointing at it are updated. Optionally replace its aliases in the same call (pass [] to clear).',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        title: { type: 'string', description: 'New title (or name, for characters and countries).' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional full alias list (max 20). Empty array clears aliases.',
        },
      },
      required: ['kind', 'id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_placement',
    category: 'write',
    requiresApproval: true,
    description:
      'world only: move a note into a category, switch its template, or change its parent. Use names ' +
      'from the library catalog (小说 for a novel, 地图 for a map). Empty string clears category / ' +
      'template; parentId: null makes it a root. Does not create categories/templates — those are ' +
      'defined by the author in the UI.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Must be world.',
        },
        id: { type: 'integer', description: 'Entity id.' },
        category: {
          type: 'string',
          description: 'Category name, or "" to clear (plain lore entry).',
        },
        template: {
          type: 'string',
          description: 'Template name, or "" to follow the category.',
        },
        parentId: {
          type: ['integer', 'null'],
          description: 'Parent note id, or null for a root entry.',
        },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_create_category',
    category: 'write',
    requiresApproval: true,
    description:
      'Create a custom category (a sidebar section backed by a note template). Pass `fields` to also ' +
      'create an info group and a note template in one call (recommended for a brand-new category). ' +
      'Without `fields`, bind an existing template (default: 词条). Deleting/editing categories is ' +
      'still done by the author in the UI.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Category name (also the note `category` value).' },
        template: {
          type: 'string',
          description: 'Existing template name to bind (e.g. 词条). Omit when passing fields.',
        },
        icon: {
          type: 'string',
          description: 'Icon name from the category icon set (e.g. sparkles, leaf, flaskConical).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional field keys (max 30). Creates an info group + note template for this category.',
        },
        labels: {
          type: 'object',
          description: 'Optional field key → display name.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'library_set_novel',
    category: 'write',
    requiresApproval: true,
    description:
      'Set the work info of a novel root note (category 小说): author, synopsis, target word count, ' +
      'notes and cover path. Create the novel root first with library_create (world, category=小说). ' +
      'Chapters are notes with parentId set to the root.',
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
    category: 'write',
    requiresApproval: true,
    description:
      'Write the body of a chapter in the novel selected for this creative-writing conversation. ' +
      'Without `chapterId` it creates a NEW chapter (never overwrites an existing one); pass ' +
      '`chapterId` to rewrite that chapter — use it to fix a chapter you just wrote. Only available ' +
      'when the author turned on write-back for this conversation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Chapter title (ignored when rewriting).' },
        markdown: { type: 'string', description: 'Chapter body in Markdown.' },
        chapterId: {
          type: 'integer',
          description: 'Existing chapter id to rewrite instead of creating a new chapter.',
        },
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
