/**
 * SSE **line** parsing — pure, no IO, no timers.
 *
 * SSE is the most fragile link in the chain (heartbeats, comments, chunk splits,
 * dirty data, `[DONE]`, error objects mid-stream). Keeping this pure makes all of
 * those enumerable in unit tests instead of discovered during debugging.
 *
 * The transport lives in Rust (`src-tauri/src/net.rs`), which hands us **whole
 * lines** so UTF-8 is never split mid-character.
 */

import type { Usage } from './types'

export interface ToolCallDelta {
  index: number
  id?: string
  name?: string
  argumentsDelta?: string
  /** Gemini 3.x: `extra_content.google.thought_signature` must be replayed. */
  extra?: Record<string, unknown>
}

export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'toolCalls'; deltas: ToolCallDelta[] }
  | { type: 'usage'; usage: Usage }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'ignore' }

const DATA_PREFIX = 'data:'
const DONE = '[DONE]'
const MAX_RAW_ERROR_LENGTH = 300

/**
 * Pull plain text out of the shapes providers use for `delta.content`:
 * a string (the norm), content parts (`[{ type: 'text', text }]`), or `{ text }`.
 * Anything unrecognised contributes nothing instead of dropping the whole chunk.
 */
function readStreamText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('')
  }
  if (value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string') {
    return (value as { text: string }).text
  }
  return ''
}

interface ChunkDelta {
  role?: string
  /** OpenAI-compatible providers send a string; some proxies send content parts. */
  content?: unknown
  reasoning_content?: unknown
  reasoning?: unknown
  text?: unknown
  tool_calls?: Array<{
    index?: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
    /** Gemini 3.x attaches the thought signature here. */
    extra_content?: unknown
  }>
}

interface ChunkChoice {
  index?: number
  delta?: ChunkDelta
  finish_reason?: string | null
}

interface ChatChunk {
  id?: string
  model?: string
  choices?: ChunkChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_cache_hit_tokens?: number
  } | null
}

/** Extract `{"error":{"message":"…"}}` from a parsed object. */
function extractErrorMessage(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const error = (obj as Record<string, unknown>).error
  if (!error || typeof error !== 'object') return null
  const message = (error as Record<string, unknown>).message
  if (typeof message === 'string' && message.trim()) return message
  return null
}

/**
 * Parse one SSE line. A malformed payload is dropped silently — one bad line
 * must never kill a stream that is otherwise fine.
 */
export function parseSseLine(line: string): StreamEvent[] {
  if (line.length === 0) return []
  // SSE comment / keep-alive, e.g. `: ping`
  if (line.startsWith(':')) return []
  // Only `data:` matters; `event:` / `id:` / `retry:` are unused here.
  if (!line.startsWith(DATA_PREFIX)) return []

  const data = line.slice(DATA_PREFIX.length).trim()
  if (data.length === 0) return []
  if (data === DONE) return [{ type: 'done' }]

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

  // The error object must be checked first: with unknown keys ignored, an error
  // body would otherwise parse into a chunk with empty `choices` and the failure
  // would be swallowed silently.
  const errorMessage = extractErrorMessage(parsed)
  if (errorMessage) return [{ type: 'error', message: errorMessage }]

  const chunk = parsed as ChatChunk
  const events: StreamEvent[] = []

  const delta = chunk.choices?.[0]?.delta
  if (delta) {
    const reasoning = readStreamText(delta.reasoning_content ?? delta.reasoning)
    if (reasoning.length > 0) {
      events.push({ type: 'reasoning', text: reasoning })
    }
    // `content` 是字符串是常态；数组 / {text} 是部分兼容网关的写法。
    // 只认字符串会把整段正文丢掉 —— 收到的只有思考、正文永远是空的。
    const content = readStreamText(delta.content ?? delta.text)
    if (content.length > 0) {
      events.push({ type: 'content', text: content })
    }
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      const deltas: ToolCallDelta[] = []
      for (const call of delta.tool_calls) {
        const extra =
          call.extra_content !== null && typeof call.extra_content === 'object'
            ? (call.extra_content as Record<string, unknown>)
            : undefined
        deltas.push({
          index: typeof call.index === 'number' ? call.index : 0,
          id: call.id,
          name: call.function?.name,
          argumentsDelta: call.function?.arguments,
          extra,
        })
      }
      events.push({ type: 'toolCalls', deltas })
    }
  }

  if (chunk.usage) {
    events.push({
      type: 'usage',
      usage: {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        cacheHitTokens: chunk.usage.prompt_cache_hit_tokens,
      },
    })
  }

  return events
}

/** Readable message out of a non-2xx response body. */
export function parseErrorMessage(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    const message = extractErrorMessage(parsed)
    if (message) return message
    // Some gateways answer `{"message": "..."}` at the top level.
    if (parsed && typeof parsed === 'object') {
      const top = (parsed as Record<string, unknown>).message
      if (typeof top === 'string' && top.trim()) return top
    }
  } catch {
    // not JSON: fall through to the raw text
  }
  return raw.slice(0, MAX_RAW_ERROR_LENGTH)
}

/**
 * Reassembles streamed `tool_calls` fragments.
 *
 * The wire format splits a call across many deltas: the first carries `id` and
 * `function.name`, every later one appends a piece of `function.arguments`.
 * Fragments are keyed by `index`, not by id (the id only shows up once).
 */
export class ToolCallAccumulator {
  private calls = new Map<
    number,
    { id: string; name: string; args: string; extra?: Record<string, unknown> }
  >()

  apply(deltas: ToolCallDelta[]): void {
    for (const delta of deltas) {
      const index = delta.index ?? 0
      const existing = this.calls.get(index) ?? { id: '', name: '', args: '' }
      if (delta.id) existing.id = delta.id
      if (delta.name) existing.name += delta.name
      if (delta.argumentsDelta) existing.args += delta.argumentsDelta
      if (delta.extra) existing.extra = delta.extra
      this.calls.set(index, existing)
    }
  }

  /** Finished calls in index order. Ids are synthesised when the server omits them. */
  list(): Array<{ id: string; name: string; args: string; extra?: Record<string, unknown> }> {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        args: call.args || '{}',
        ...(call.extra ? { extra: call.extra } : {}),
      }))
      .filter((call) => call.name.length > 0)
  }

  get size(): number {
    return this.calls.size
  }

  clear(): void {
    this.calls.clear()
  }
}

/**
 * Accumulates raw lines into events.
 *
 * Rust already emits whole lines, so this is mostly for re-parsing a whole
 * response body in tests and for the "stream ended without [DONE]" case.
 */
export class SseEventAssembler {
  private buffer = ''
  readonly toolCalls = new ToolCallAccumulator()

  push(chunk: string): StreamEvent[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    const events: StreamEvent[] = []
    for (const line of lines) {
      events.push(...parseSseLine(line.replace(/\r$/, '')))
    }
    return events
  }

  flush(): StreamEvent[] {
    if (!this.buffer) return []
    const rest = this.buffer
    this.buffer = ''
    return parseSseLine(rest.replace(/\r$/, ''))
  }
}
