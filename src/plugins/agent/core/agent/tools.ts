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
      "lore entries). Omit `kind` for an overview with counts. Newest edits first.",
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['character', 'event', 'country', 'world'],
          description: 'Entity kind to list. Omit for an overview of all four.',
        },
        limit: { type: 'integer', description: 'Max rows per kind (default 40, max 200).' },
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
      'Search the library by title, alias or tag name. Does not scan body text, so prefer ' +
      'library_list when you only want to browse.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title, alias or tag fragment.' },
        limit: { type: 'integer', description: 'Max hits (default 20, max 50).' },
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
    name: 'library_set_fields',
    category: 'write',
    requiresApproval: true,
    description:
      "Update scalar text fields of one library entry (a character's race / occupation / faction, " +
      "an event's location, a country's geography, …). Read the entry first. Does not touch the " +
      "body text and does not rename anything. An empty string clears the field.",
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
            'Field name → new text. Characters accept race / element / occupation / faction / ' +
            'height / birthday / bio; events accept time / endTime / location / summary; ' +
            'countries accept description / system / geography / culture.',
          additionalProperties: { type: 'string' },
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
      'with library_link.',
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
      },
      required: ['kind', 'title'],
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
    case 'library_search':
      return pick('query') ?? ''
    default:
      return ''
  }
}
