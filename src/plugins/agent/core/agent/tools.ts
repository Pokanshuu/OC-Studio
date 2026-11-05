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
    default:
      return ''
  }
}
