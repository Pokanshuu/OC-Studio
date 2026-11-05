/**
 * The agent loop.
 *
 * One iteration = one model turn:
 *
 * ```
 * build request (history + tool results so far)
 *      ↓ stream
 * content / reasoning / tool_calls
 *      ↓
 * no tool calls ──────────────► done, this turn's text is the answer
 *      ↓ has tool calls
 * for each call: approve → execute → append `tool` message
 *      ↓
 * next iteration
 * ```
 *
 * Everything with side effects is injected (`stream`, `approve`, `execute`), so
 * the control flow — which is where stop conditions, cancellation and the
 * assistant/tool message pairing are decided — is testable without a network, a
 * window, or a filesystem.
 */

import { ToolCallAccumulator, type StreamEvent } from '../sseParser'
import type { ChatRequestBody, OutMessage } from '../chatRequest'
import type { AgentStep, ToolCall, ToolResult, Usage } from '../types'
import { answerStepIndex } from './trace'
import type { ToolSpec } from './tools'

export type ApprovalDecision = 'allow' | 'deny' | 'always'

export interface AgentDelta {
  stepIndex: number
  content?: string
  reasoning?: string
  toolCalls?: ToolCall[]
}

export interface AgentLoopDeps {
  /** System + conversation history, already ordered and filtered. */
  history: OutMessage[]
  tools: ToolSpec[]
  maxSteps: number
  signal: AbortSignal
  buildBody: (messages: OutMessage[], tools: ToolSpec[]) => ChatRequestBody
  /** Resolves when the stream ends. Errors are reported through `StreamEvent`. */
  stream: (
    body: ChatRequestBody,
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void,
  ) => Promise<void>
  /** Ask the user. `always` means "stop asking for this tool this session". */
  approve: (call: ToolCall) => Promise<ApprovalDecision>
  execute: (call: ToolCall) => Promise<ToolResult>
  onStepStart: (step: AgentStep) => void
  onDelta: (delta: AgentDelta) => void
  onToolUpdate: (stepIndex: number, call: ToolCall) => void
}

export interface AgentLoopResult {
  steps: AgentStep[]
  /** Transport/model failure — the run is over. */
  error: string | null
  /** The user pressed stop. */
  stopped: boolean
  /** Hit `maxSteps` while still working. */
  exhausted: boolean
}

const DENIED_RESULT: ToolResult = {
  content: 'The user denied this tool call. Do not retry it; ask for clarification or try another approach.',
  isError: true,
  durationMs: 0,
}

export async function runAgentLoop(deps: AgentLoopDeps): Promise<AgentLoopResult> {
  const steps: AgentStep[] = []
  const working: OutMessage[] = [...deps.history]
  // 工具用够多之后强制收口：模型很容易一直调工具、最后一轮只回 reasoning，
  // 界面上就只剩一片空白。到这一步不再给工具，逼它用文字回答。
  const FORCE_ANSWER_AFTER = 20
  let forcedRetry = false

  for (let index = 0; index < deps.maxSteps; index++) {
    if (deps.signal.aborted) return { steps, error: null, stopped: true, exhausted: false }

    const forceAnswer = index >= FORCE_ANSWER_AFTER
    const step: AgentStep = {
      index,
      content: '',
      reasoning: '',
      toolCalls: [],
    }
    steps.push(step)
    deps.onStepStart(step)

    const accumulator = new ToolCallAccumulator()
    let usage: Usage | undefined
    let failure: string | null = null
    let sawToolCalls = false

    const body = deps.buildBody(
      forceAnswer
        ? [...working, { role: 'user', content: '（系统）工具调用已经够了：停止调用工具，直接用文字给出结论。' }]
        : working,
      forceAnswer ? [] : deps.tools,
    )

    await deps.stream(body, deps.signal, (event) => {
      switch (event.type) {
        case 'content':
          step.content += event.text
          deps.onDelta({ stepIndex: index, content: step.content })
          break
        case 'reasoning':
          step.reasoning += event.text
          deps.onDelta({ stepIndex: index, reasoning: step.reasoning })
          break
        case 'toolCalls':
          sawToolCalls = true
          accumulator.apply(event.deltas)
          deps.onDelta({ stepIndex: index, toolCalls: toToolCalls(accumulator) })
          break
        case 'usage':
          usage = event.usage
          break
        case 'error':
          failure = event.message
          break
        default:
          break
      }
    })

    step.usage = usage

    if (failure) return { steps, error: failure, stopped: false, exhausted: false }
    if (deps.signal.aborted) return { steps, error: null, stopped: true, exhausted: false }

    const calls = accumulator.list()
    if (!sawToolCalls || calls.length === 0) {
      // No tools wanted: this turn's text is the answer.
      if (step.content.trim() === '' && !forcedRetry) {
        // 模型这一轮只回了 reasoning / 空内容：再问一次，逼它出正文
        forcedRetry = true
        working.push({
          role: 'user',
          content: '（系统）你上一轮没有输出正文。请直接用文字给出最终答复。',
        })
        continue
      }
      return { steps, error: null, stopped: false, exhausted: false }
    }

    step.toolCalls = calls.map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
      status: 'pending' as const,
    }))
    deps.onDelta({ stepIndex: index, toolCalls: step.toolCalls })

    // The assistant turn that requested the tools must be in history *before*
    // the tool results, otherwise the pairing is invalid and the API rejects it.
    working.push({
      role: 'assistant',
      content: step.content.trim(),
      tool_calls: step.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.args || '{}' },
      })),
    })

    for (const call of step.toolCalls) {
      if (deps.signal.aborted) {
        call.status = 'denied'
        call.result = { content: 'Run stopped by the user.', isError: true, durationMs: 0 }
        deps.onToolUpdate(index, call)
        working.push({ role: 'tool', tool_call_id: call.id, content: call.result.content })
        continue
      }

      const spec = deps.tools.find((t) => t.name === call.name)
      let decision: ApprovalDecision = 'allow'
      if (spec?.requiresApproval) {
        decision = await deps.approve(call)
      }

      if (decision === 'deny') {
        call.status = 'denied'
        call.result = DENIED_RESULT
        deps.onToolUpdate(index, call)
        working.push({ role: 'tool', tool_call_id: call.id, content: DENIED_RESULT.content })
        continue
      }

      call.status = 'running'
      deps.onToolUpdate(index, call)

      try {
        call.result = await deps.execute(call)
        call.status = call.result.isError ? 'error' : 'done'
      } catch (error) {
        call.result = {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
          durationMs: 0,
        }
        call.status = 'error'
      }
      deps.onToolUpdate(index, call)
      working.push({
        role: 'tool',
        tool_call_id: call.id,
        content: call.result.content,
      })
    }
  }

  return { steps, error: null, stopped: false, exhausted: true }
}

function toToolCalls(accumulator: ToolCallAccumulator): ToolCall[] {
  return accumulator.list().map((call) => ({
    id: call.id,
    name: call.name,
    args: call.args,
    status: 'pending' as const,
  }))
}

/** Re-exported so callers keep importing placement rules from the loop module. */
export { answerStepIndex, lastNoToolStepIndex, placeSteps } from './trace'

/** The visible answer of a finished run (empty when it ended on a tool call). */
export function finalAnswer(steps: AgentStep[]): string {
  const index = answerStepIndex(steps)
  return index < 0 ? '' : steps[index].content
}

/** Reasoning of the last turn that had any — what the thinking panel shows. */
export function finalReasoning(steps: AgentStep[]): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].reasoning.trim().length > 0) return steps[i].reasoning
  }
  return ''
}

export function totalToolCalls(steps: AgentStep[]): number {
  return steps.reduce((sum, step) => sum + step.toolCalls.length, 0)
}