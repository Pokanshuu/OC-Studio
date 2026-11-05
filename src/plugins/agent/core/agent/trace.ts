/**
 * Where each agent turn goes on screen.
 *
 * Pure, because the previous version got this wrong: reasoning was hoisted into
 * a single block above everything, so a thought could not be matched to the call
 * it motivated. The rule is now positional:
 *
 * - the **answer** turn (last turn with text and no tool calls) renders as the
 *   message body, with its reasoning directly above it;
 * - the **active** turn (last turn with no tool calls, possibly still empty)
 *   renders the same way while it is being written;
 * - everything else renders in the trace, in the order it happened.
 */

import type { AgentStep } from '../types'

export interface StepPlacement {
  /** Turns shown in the execution trace, in order. */
  timeline: AgentStep[]
  /** Turn whose text is the visible answer (may be null). */
  answer: AgentStep | null
  /** Turn currently being written; its reasoning is live above the body. */
  active: AgentStep | null
}

export function answerStepIndex(steps: AgentStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].toolCalls.length === 0 && steps[i].content.trim().length > 0) return i
  }
  return -1
}

export function lastNoToolStepIndex(steps: AgentStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].toolCalls.length === 0) return i
  }
  return -1
}

export function placeSteps(steps: AgentStep[]): StepPlacement {
  const answerIndex = answerStepIndex(steps)
  const activeIndex = lastNoToolStepIndex(steps)
  const excluded = new Set<number>()
  if (answerIndex >= 0) excluded.add(answerIndex)
  if (activeIndex >= 0) excluded.add(activeIndex)

  return {
    timeline: steps.filter((_step, index) => !excluded.has(index)),
    answer: answerIndex >= 0 ? steps[answerIndex] : null,
    active: activeIndex >= 0 ? steps[activeIndex] : null,
  }
}

/**
 * Reasoning shown above the message body: the active turn's while it is being
 * written, otherwise the answer turn's. `fallback` covers rows written before
 * `steps` existed, where only the message-level reasoning was stored.
 */
export function bodyReasoning(steps: AgentStep[], fallback: string | null): string {
  if (steps.length === 0) return (fallback ?? '').trim()
  const { active, answer } = placeSteps(steps)
  return (active?.reasoning ?? answer?.reasoning ?? '').trim()
}
