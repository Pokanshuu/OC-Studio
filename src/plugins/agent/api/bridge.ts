/**
 * Typed bridge to the Rust backend.
 *
 * Every IPC call in the app goes through this module: no component ever holds a
 * command name string. The mappers at the bottom decode the JSON columns
 * (`attachments`, `steps`) that SQLite stores as text, and are defensive because
 * a malformed row must degrade to "one odd message", never to a white screen.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  AgentStep,
  Attachment,
  Compaction,
  Conversation,
  Draft,
  ImportSummary,
  Message,
  MessageRow,
  MessageStatus,
  Preset,
  SearchHit,
  ToolResponse,
} from '@/plugins/agent/core/types'

// ── raw commands ────────────────────────────────────────────────────────────

export const cmd = {
  listConversations: () => invoke<Conversation[]>('list_conversations'),
  findConversation: (id: string) => invoke<Conversation | null>('find_conversation', { id }),
  createConversation: (input: {
    mode: string
    provider: string
    model: string
    systemPrompt?: string | null
    workspace?: string | null
    title?: string | null
  }) => invoke<Conversation>('create_conversation', { input }),
  updateConversation: (
    id: string,
    patch: {
      title?: string
      mode?: string
      systemPrompt?: string | null
      workspace?: string | null
      pinned?: boolean
      model?: string
      provider?: string
    },
  ) => invoke<Conversation | null>('update_conversation', { id, patch }),
  deleteConversation: (id: string) => invoke<void>('delete_conversation', { id }),
  touchConversation: (id: string) => invoke<void>('touch_conversation', { id }),
  forkConversation: (conversationId: string, messageId: string, title?: string | null) =>
    invoke<Conversation | null>('fork_conversation', { conversationId, messageId, title }),

  loadMessages: (conversationId: string) =>
    invoke<MessageRow[]>('load_messages', { conversationId }),
  appendMessage: (input: {
    conversationId: string
    parentId: string
    role: string
    content: string
    attachments?: string | null
    reasoning?: string | null
    steps?: string | null
    status?: string
    model?: string | null
    id?: string
  }) => invoke<MessageRow>('append_message', { input }),
  updateMessage: (
    id: string,
    patch: {
      content?: string
      reasoning?: string
      steps?: string
      attachments?: string
      status?: string
      errorMessage?: string
      model?: string
      thinkingMs?: number
      ttftMs?: number
      tps?: number
      tokensIn?: number
      tokensOut?: number
    },
  ) => invoke<void>('update_message', { id, patch }),
  setActiveVariant: (conversationId: string, parentId: string, messageId: string) =>
    invoke<void>('set_active_variant', { conversationId, parentId, messageId }),
  deleteSubtree: (messageId: string) => invoke<void>('delete_subtree', { messageId }),

  getDraft: (conversationId: string) => invoke<Draft | null>('get_draft', { conversationId }),
  saveDraft: (conversationId: string, text: string, title?: string | null) =>
    invoke<void>('save_draft', { conversationId, text, title }),
  clearDraftTitle: (conversationId: string) => invoke<void>('clear_draft_title', { conversationId }),
  listDrafts: () => invoke<Draft[]>('list_drafts'),

  listPresets: () => invoke<Preset[]>('list_presets'),
  savePreset: (id: string | null, name: string, content: string, sortOrder?: number) =>
    invoke<Preset>('save_preset', { id, name, content, sortOrder }),
  deletePreset: (id: string) => invoke<void>('delete_preset', { id }),
  getConversationPresets: (conversationId: string) =>
    invoke<Array<[string, number, boolean]>>('get_conversation_presets', { conversationId }),
  setConversationPresets: (
    conversationId: string,
    entries: Array<[string, number, boolean]>,
  ) => invoke<void>('set_conversation_presets', { conversationId, entries }),

  getCompaction: (conversationId: string) =>
    invoke<Compaction | null>('get_compaction', { conversationId }),
  saveCompaction: (conversationId: string, throughMessageId: string, summary: string) =>
    invoke<Compaction>('save_compaction', { conversationId, throughMessageId, summary }),
  deleteCompaction: (conversationId: string) => invoke<void>('delete_compaction', { conversationId }),

  getSettings: () => invoke<string | null>('get_settings'),
  saveSettings: (value: string) => invoke<void>('save_settings', { value }),

  search: (query: string, limit?: number) =>
    invoke<SearchHit[]>('search_conversations', { query, limit }),

  exportBackup: (path: string) => invoke<number>('export_backup_to', { path }),
  importBackup: (path: string) => invoke<ImportSummary>('import_backup_from', { path }),
  importChatbox: (path: string, provider: string, model: string) =>
    invoke<ImportSummary>('import_chatbox_from', { path, provider, model }),

  runTool: (name: string, args: Record<string, unknown>, workspace: string) =>
    invoke<ToolResponse>('run_tool', { name, args, workspace }),
  auditToolCall: (
    conversationId: string,
    tool: string,
    args: string,
    ok: boolean,
    durationMs: number,
  ) => invoke<void>('audit_tool_call', { conversationId, tool, args, ok, durationMs }),
  workspaceInfo: (workspace: string) =>
    invoke<{
      root: string
      name: string
      fileCount: number
      totalBytes: number
      entries: string[]
    }>('workspace_info', { workspace }),

  readTextFile: (path: string) =>
    invoke<{ name: string; path: string; text: string; bytes: number; extracted: boolean }>(
      'read_text_file',
      { path },
    ),
  readImageFile: (path: string) =>
    invoke<{ name: string; path: string; dataUrl: string; bytes: number }>('read_image_file', {
      path,
    }),
  writeTextFile: (path: string, content: string) =>
    invoke<void>('write_text_file', { path, content }),

  appInfo: () =>
    invoke<{ version: string; dataDir: string; dbPath: string }>('app_info'),

  httpGet: (url: string, headers: Record<string, string> = {}) =>
    invoke<{ status: number; body: string }>('http_get', { url, headers }),

  saveApiKey: (key: string) => invoke<void>('save_api_key', { key }),
  loadApiKey: () => invoke<string>('load_api_key'),
  clearApiKey: () => invoke<void>('clear_api_key'),
  apiKeyHint: () => invoke<[boolean, string]>('api_key_hint'),

  cancelStream: (streamId: string) => invoke<void>('cancel_stream', { streamId }),

  chatStream: (args: {
    streamId: string
    url: string
    headers: Record<string, string>
    body: unknown
  }) => invoke<void>('chat_stream', args),
}

// ── mappers ─────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

export function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    parentId: row.parentId,
    variantIndex: row.variantIndex,
    active: row.active,
    role: row.role,
    content: row.content ?? '',
    attachments: parseJson<Attachment[]>(row.attachments, []),
    reasoning: row.reasoning,
    steps: parseJson<AgentStep[]>(row.steps, []),
    status: (row.status ?? 'DONE') as MessageStatus,
    errorMessage: row.errorMessage,
    model: row.model,
    thinkingMs: row.thinkingMs,
    ttftMs: row.ttftMs,
    tps: row.tps,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  }
}

export function attachmentsJson(attachments: Attachment[]): string | null {
  return attachments.length > 0 ? JSON.stringify(attachments) : null
}

export function stepsJson(steps: AgentStep[]): string | null {
  return steps.length > 0 ? JSON.stringify(steps) : null
}

/** Update a message, serialising the JSON columns when they are provided. */
export async function patchMessage(
  id: string,
  patch: {
    content?: string
    reasoning?: string | null
    steps?: AgentStep[]
    attachments?: Attachment[]
    status?: MessageStatus
    errorMessage?: string | null
    model?: string
    thinkingMs?: number
    ttftMs?: number
    tps?: number
    tokensIn?: number
    tokensOut?: number
  },
): Promise<void> {
  const wire: Record<string, unknown> = {}
  if (patch.content !== undefined) wire.content = patch.content
  if (patch.reasoning !== undefined) wire.reasoning = patch.reasoning ?? ''
  if (patch.steps !== undefined) wire.steps = stepsJson(patch.steps) ?? '[]'
  if (patch.attachments !== undefined) wire.attachments = attachmentsJson(patch.attachments) ?? '[]'
  if (patch.status !== undefined) wire.status = patch.status
  if (patch.errorMessage !== undefined) wire.errorMessage = patch.errorMessage ?? ''
  if (patch.model !== undefined) wire.model = patch.model
  if (patch.thinkingMs !== undefined) wire.thinkingMs = patch.thinkingMs
  if (patch.ttftMs !== undefined) wire.ttftMs = patch.ttftMs
  if (patch.tps !== undefined) wire.tps = patch.tps
  if (patch.tokensIn !== undefined) wire.tokensIn = patch.tokensIn
  if (patch.tokensOut !== undefined) wire.tokensOut = patch.tokensOut
  await cmd.updateMessage(id, wire as never)
}
