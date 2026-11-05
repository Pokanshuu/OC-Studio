/**
 * Streaming transport: Rust emits whole SSE lines, this turns them into
 * {@link StreamEvent}s.
 *
 * One module-level listener serves every stream (there is at most a handful of
 * live ones) and dispatches by `streamId`, so starting a stream never leaves a
 * dangling unlisten behind.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { cmd } from './bridge'
import { parseErrorMessage, parseSseLine, type StreamEvent } from '@/plugins/agent/core/sseParser'

export interface StreamPayload {
  streamId: string
  kind: 'line' | 'done' | 'error'
  line?: string
  status?: number
  body?: string
  message?: string
}

type Handler = (payload: StreamPayload) => void

const handlers = new Map<string, Handler>()
let listener: Promise<UnlistenFn> | null = null

function ensureListener(): Promise<UnlistenFn> {
  if (!listener) {
    listener = listen<StreamPayload>('chat://stream', (event) => {
      handlers.get(event.payload.streamId)?.(event.payload)
    })
  }
  return listener
}

export interface StreamOptions {
  url: string
  headers: Record<string, string>
  body: unknown
  signal: AbortSignal
  onEvent: (event: StreamEvent) => void
}

/**
 * Run one completion. Resolves when the stream ends, fails, or is cancelled —
 * it never rejects: failures arrive as `{type:'error'}` events so the caller has
 * a single place to handle them.
 */
export async function streamCompletion(options: StreamOptions): Promise<void> {
  const streamId = crypto.randomUUID()
  await ensureListener()

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      handlers.delete(streamId)
      resolve()
    }

    const onAbort = () => {
      void cmd.cancelStream(streamId).catch(() => undefined)
      finish()
    }

    if (options.signal.aborted) {
      finish()
      return
    }
    options.signal.addEventListener('abort', onAbort, { once: true })

    handlers.set(streamId, (payload) => {
      if (payload.kind === 'line' && payload.line !== undefined) {
        for (const event of parseSseLine(payload.line)) {
          if (event.type === 'done') {
            options.onEvent(event)
            // The server said [DONE]; no need to wait for the socket to close.
            void cmd.cancelStream(streamId).catch(() => undefined)
            finish()
            return
          }
          options.onEvent(event)
        }
        return
      }

      if (payload.kind === 'error') {
        const message =
          parseErrorMessage(payload.body) ??
          payload.message ??
          (payload.status ? `HTTP ${payload.status}` : 'Request failed')
        options.onEvent({ type: 'error', message })
        return
      }

      if (payload.kind === 'done') finish()
    })

    cmd
      .chatStream({
        streamId,
        url: options.url,
        headers: options.headers,
        body: options.body,
      })
      .catch((error: unknown) => {
        options.onEvent({ type: 'error', message: String(error) })
        finish()
      })
  })
}

/** Fetch the provider's model list (used by settings). */
export async function fetchRemoteModels(
  url: string,
  headers: Record<string, string> = {},
): Promise<string[]> {
  const result = await cmd.httpGet(url, headers)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`HTTP ${result.status}`)
  }
  try {
    const parsed = JSON.parse(result.body) as { data?: Array<{ id?: string }> }
    return (parsed.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    throw new Error('响应不是合法的 JSON')
  }
}
