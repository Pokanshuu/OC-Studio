/** Shared domain types. Shapes mirror the SQLite rows (`src-tauri/src/models.rs`). */

export type MessageRole = 'user' | 'assistant' | 'tool'
export type MessageStatus = 'DONE' | 'STREAMING' | 'STOPPED' | 'ERROR'
export type ConversationMode = 'CREATIVE' | 'ROLEPLAY' | 'AGENT'
export type ProviderKind = 'DEEPSEEK' | 'OPENCODE_GO' | 'GEMINI' | 'CUSTOM'

export interface Conversation {
  id: string
  title: string
  mode: ConversationMode
  provider: ProviderKind
  model: string
  systemPrompt: string | null
  /** Agent sandbox root; `null` disables agent tools for this conversation. */
  workspace: string | null
  createdAt: number
  updatedAt: number
  pinned: boolean
  pinnedAt: number | null
}

export interface Attachment {
  kind: 'image' | 'text'
  name: string
  bytes: number
  /** `data:image/...;base64,…` for images. */
  dataUrl?: string
  /** Plain text body for text attachments (already extracted from docx/pdf). */
  data?: string
  extracted?: boolean
}

export type ToolCallStatus = 'pending' | 'approved' | 'denied' | 'running' | 'done' | 'error'

export interface ToolResult {
  content: string
  isError: boolean
  data?: unknown
  durationMs: number
}

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON string as produced by the model (shown verbatim until parsed). */
  args: string
  status: ToolCallStatus
  result?: ToolResult
  /** Human-readable one-liner for the collapsed card. */
  summary?: string
  /**
   * Provider metadata that must be replayed with the call.
   *
   * Gemini 3.x requires `extra_content.google.thought_signature` on every
   * `functionCall` part sent back; dropping it makes the next request 400
   * ("Function call is missing a thought_signature"). Other providers leave
   * this empty and it serializes to `extra_content` only when present.
   */
  extra?: Record<string, unknown>
}

/** One model turn inside an assistant message. */
export interface AgentStep {
  index: number
  content: string
  reasoning: string
  thinkingMs?: number
  toolCalls: ToolCall[]
  usage?: Usage
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  cacheHitTokens?: number
}

/** A message as the UI sees it (row + decoded JSON columns). */
export interface Message {
  id: string
  conversationId: string
  parentId: string
  variantIndex: number
  active: boolean
  role: MessageRole
  content: string
  attachments: Attachment[]
  reasoning: string | null
  steps: AgentStep[]
  status: MessageStatus
  errorMessage: string | null
  model: string | null
  thinkingMs: number | null
  ttftMs: number | null
  tps: number | null
  tokensIn: number | null
  tokensOut: number | null
  createdAt: number
}

/** Row shape coming out of Rust. */
export interface MessageRow {
  id: string
  conversationId: string
  parentId: string
  variantIndex: number
  active: boolean
  role: MessageRole
  content: string
  attachments: string | null
  reasoning: string | null
  steps: string | null
  status: MessageStatus
  errorMessage: string | null
  model: string | null
  thinkingMs: number | null
  ttftMs: number | null
  tps: number | null
  tokensIn: number | null
  tokensOut: number | null
  createdAt: number
}

export interface Compaction {
  id: string
  conversationId: string
  throughMessageId: string
  summary: string
  createdAt: number
  updatedAt: number
}

export interface Preset {
  id: string
  name: string
  content: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Draft {
  conversationId: string
  text: string
  updatedAt: number
  title: string | null
}

export interface SearchHit {
  conversationId: string
  title: string
  updatedAt: number
  matchedTitle: boolean
  snippet: string
  matchStart: number
  matchLen: number
}

export interface ToolResponse {
  content: string
  isError: boolean
  data?: unknown
  durationMs: number
}

export type ApprovalPolicy = 'ask' | 'auto' | 'never'

/** A single item of the plan the model maintains with `todo_write`. */
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface AgentSettings {
  workspace: string | null
  maxSteps: number
  approval: ApprovalPolicy
  /** Tool names the model is allowed to call. */
  enabledTools: string[]
  /** Let the agent keep going until it stops calling tools. */
  autoContinue: boolean
}

export interface UiSettings {
  theme: 'system' | 'light' | 'dark'
  fontScale: number
  language: 'auto' | 'zh' | 'en'
  autoCollapseThinking: boolean
  showTokenRing: boolean
  sendKey: 'enter' | 'ctrlEnter'
  density: 'comfortable' | 'compact'
  /** Reopened on launch; `null` = start on a blank new conversation. */
  lastConversationId: string | null
}

export interface ApiSettings {
  provider: ProviderKind
  baseUrl: string
  model: string
  thinking: ReasoningLevel
  temperature: number
  topP: number
  maxTokens: number | null
}

export interface ReasoningLevelInfo {
  id: ReasoningLevel
  apiValue: string | null
}

/** Mirrors `ReasoningLevel` in the Android app: one slider, three stops. */
export type ReasoningLevel = 'off' | 'high' | 'max'

export const REASONING_LEVELS: ReasoningLevelInfo[] = [
  { id: 'off', apiValue: null },
  { id: 'high', apiValue: 'high' },
  { id: 'max', apiValue: 'max' },
]

export interface Settings {
  api: ApiSettings
  agent: AgentSettings
  ui: UiSettings
  /** 旧版全局补充提示词；仍在拼接链末尾生效，界面上不再单独暴露。 */
  systemPrompt: string
  /** 各模式的系统提示词覆盖；空串 = 用内置默认。 */
  systemPrompts: Record<ConversationMode, string>
  enabledPresets: string[]
  /** 创作 / 扮演追加的写作手法 id（见 `core/agent/writing.ts`）；空数组 = 不追加 */
  writingSkills: string[]
  autoTitle: boolean
  compactKeepRecent: number
}

/** `{ok:false}` results never throw in Tauri; everything else is a rejected promise. */
export interface ImportSummary {
  conversations: number
  messages: number
  presets: number
  skipped: number
}
