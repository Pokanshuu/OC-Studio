/**
 * Request assembly: the protocol layer's hard rules live here.
 *
 * Parameter conditioning (from the provider docs, and the source of a lot of
 * "I set it but nothing changed" bug reports):
 *
 * | model supports thinking | thinking on | fields sent |
 * |---|---|---|
 * | no  | —    | no `thinking`, no `reasoning_effort` at all |
 * | yes | yes  | `thinking.type=enabled`, `reasoning_effort`, `top_p` — **no** `temperature` |
 * | yes | no   | `thinking.type=disabled` — **no** `top_p` |
 *
 * `temperature` is silently ignored while thinking, and `top_p` is always 1.0
 * outside it, so sending either one just misleads the user.
 */

import type { Message, ReasoningLevel } from './types'
import type { Attachment } from './types'
import { findModel, type ModelInfo } from './provider'
import { toOpenAiTools, type ToolSpec } from './agent/tools'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: string } }

export interface OutMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/**
 * Image detail. Deliberately `high`: `low` downsizes to 512×512, and "read the
 * text in this screenshot" is the most common reason to attach an image.
 */
export const IMAGE_DETAIL = 'high'

/** Upper bound per image given by the vision docs; used for the token ring. */
export const IMAGE_TOKEN_UPPER_BOUND = 1024

/** Text attachments are wrapped in delimiters so the model can tell them apart. */
export function attachmentToPromptBlock(attachment: Attachment): string {
  const body = attachment.data ?? ''
  return `<file name="${attachment.name}">\n${body}\n</file>`
}

/**
 * Build one **user** message `content`.
 *
 * Three shapes, simplest wins: no attachments → plain string; text files only →
 * plain string with the files appended; images → content-block array (images are
 * only legal in user messages; anywhere else is a 400).
 *
 * Images are re-sent on **every** request — the API is stateless — which is also
 * why they are stored rather than discarded after use.
 */
export function userContent(text: string, attachments: Attachment[]): string | ContentPart[] {
  if (attachments.length === 0) return text

  const textFiles = attachments.filter((a) => a.kind === 'text')
  const images = attachments.filter((a) => a.kind === 'image')

  let body = text
  for (const file of textFiles) {
    if (body.length > 0) body += '\n'
    body += `\n${attachmentToPromptBlock(file)}`
  }
  body = body.trim()

  if (images.length === 0) return body

  const parts: ContentPart[] = []
  if (body.length > 0) parts.push({ type: 'text', text: body })
  for (const image of images) {
    if (!image.dataUrl) continue
    parts.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: IMAGE_DETAIL } })
  }
  return parts
}

/**
 * Replay one assistant turn as the exact message sequence that produced it.
 *
 * A stored assistant message is one *visible* node, but it may contain several
 * model turns (an agent loop). Each turn with tool calls becomes
 * `assistant(tool_calls)` followed by one `tool` message per result — without
 * this the model would see tool results with no matching call and reject the
 * request.
 */
export function messageToOut(message: Message): OutMessage[] {
  if (message.role === 'user') {
    return [{ role: 'user', content: userContent(message.content, message.attachments) }]
  }

  const steps =
    message.steps.length > 0
      ? message.steps
      : [
          {
            index: 0,
            content: message.content,
            reasoning: message.reasoning ?? '',
            toolCalls: [],
          },
        ]

  const out: OutMessage[] = []
  for (const step of steps) {
    const calls = step.toolCalls.filter((call) => call.result !== undefined)
    const content = step.content.trim()

    if (calls.length === 0) {
      if (content.length > 0) out.push({ role: 'assistant', content })
      continue
    }

    out.push({
      role: 'assistant',
      content,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.args || '{}' },
      })),
    })
    for (const call of calls) {
      out.push({
        role: 'tool',
        tool_call_id: call.id,
        content: call.result?.content ?? '',
      })
    }
  }
  return out
}

export interface ChatRequestOptions {
  provider: 'DEEPSEEK' | 'OPENCODE_GO' | 'CUSTOM'
  modelId: string
  messages: OutMessage[]
  /** Slider position; `off` turns thinking off. */
  reasoning: ReasoningLevel
  temperature: number
  topP: number
  maxTokens: number | null
  tools?: ToolSpec[]
}

export interface ChatRequestBody extends Record<string, unknown> {
  model: string
  messages: OutMessage[]
  stream: true
}

/**
 * Build the `/chat/completions` body.
 *
 * `stream` must never be omitted or defaulted: with `encodeDefaults`-style
 * behaviour a missing `stream` makes the server answer with one non-streaming
 * JSON blob — the visible symptom is "the stream finished, the answer is empty,
 * and nothing errored".
 */
export function buildChatRequest(options: ChatRequestOptions): ChatRequestBody {
  const model: ModelInfo = findModel(options.provider, options.modelId)
  const thinkingActive = model.supportsThinking && options.reasoning !== 'off'

  const body: ChatRequestBody = {
    model: model.id,
    messages: options.messages,
    stream: true,
  }

  if (model.supportsThinking) {
    body.thinking = { type: thinkingActive ? 'enabled' : 'disabled' }
  }
  if (thinkingActive) {
    const apiValue =
      options.reasoning === 'max' ? 'max' : options.reasoning === 'high' ? 'high' : null
    if (apiValue) body.reasoning_effort = apiValue
    body.top_p = options.topP
  } else {
    body.temperature = options.temperature
  }

  if (options.maxTokens && options.maxTokens > 0) body.max_tokens = options.maxTokens

  if (options.tools && options.tools.length > 0) {
    body.tools = toOpenAiTools(options.tools)
    body.tool_choice = 'auto'
  }

  return body
}

/** Rough token cost of an attachment list: images use the documented upper bound. */
export function attachmentTokenCost(attachments: Attachment[]): number {
  let total = 0
  for (const attachment of attachments) {
    if (attachment.kind === 'image') {
      // Overestimate on purpose: the ring warns "about to overflow", and
      // underestimating is what makes that warning useless.
      total += IMAGE_TOKEN_UPPER_BOUND
    } else if (attachment.data) {
      total += Math.max(1, Math.round(attachment.data.length / 3))
    }
  }
  return total
}
