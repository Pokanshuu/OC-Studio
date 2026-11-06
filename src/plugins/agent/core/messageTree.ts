/**
 * Pure functions over the message **tree**.
 *
 * The message model is a tree, not a positional stack: identity is `parentId`,
 * siblings are versions selected by `active`, and the visible conversation is the
 * path that walks `active` from the root. "Regenerate" and "edit & resend" hang a
 * new sibling under the same parent, leaving the old branch — and its whole
 * subtree — intact and switchable.
 *
 * Not recursive SQL on purpose: a conversation is a few hundred rows, so walking
 * in memory after one read is simpler, testable and dialect-free.
 */

import type { Message } from './types'

export const ROOT_PARENT = ''

/** The visible conversation: from the root, follow `active` all the way down. */
export function activePath(all: Message[]): Message[] {
  const byParent = new Map<string, Message[]>()
  for (const message of all) {
    const list = byParent.get(message.parentId)
    if (list) list.push(message)
    else byParent.set(message.parentId, [message])
  }

  const path: Message[] = []
  const visited = new Set<string>()
  let parentId = ROOT_PARENT

  for (;;) {
    const siblings = byParent.get(parentId)
    const next = siblings?.find((m) => m.active)
    if (!next) break
    // Cycle guard: this runs on the render path, so a corrupted row must not hang
    // the UI — showing less is always better than freezing.
    if (visited.has(next.id)) break
    visited.add(next.id)
    path.push(next)
    parentId = next.id
  }
  return path
}

/** `parentId` → number of siblings. Drives the `‹ n/m ›` switcher. */
export function siblingCounts(all: Message[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const message of all) {
    counts.set(message.parentId, (counts.get(message.parentId) ?? 0) + 1)
  }
  return counts
}

/** A node and its entire subtree — deleting a message deletes what came after it. */
export function subtreeIds(all: Message[], rootId: string): string[] {
  const childrenByParent = new Map<string, Message[]>()
  for (const message of all) {
    const list = childrenByParent.get(message.parentId)
    if (list) list.push(message)
    else childrenByParent.set(message.parentId, [message])
  }

  const out: string[] = []
  const seen = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    for (const child of childrenByParent.get(id) ?? []) stack.push(child.id)
  }
  return out
}

/** Highest `variantIndex` among the siblings — used to hand back `active`. */
export function lastSibling(all: Message[], parentId: string): Message | null {
  let best: Message | null = null
  for (const message of all) {
    if (message.parentId !== parentId) continue
    if (!best || message.variantIndex > best.variantIndex) best = message
  }
  return best
}

/** The segment of the active path **up to and including** `messageId`. */
export function pathTo(all: Message[], messageId: string): Message[] {
  const path = activePath(all)
  const end = path.findIndex((m) => m.id === messageId)
  return end < 0 ? [] : path.slice(0, end + 1)
}

/** Siblings of a node, ordered by version — the switcher's list. */
export function siblingsOf(all: Message[], parentId: string): Message[] {
  return all
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.variantIndex - b.variantIndex)
}

/** 1-based position of `messageId` among its siblings (for `n/m`). */
export function variantLabel(all: Message[], message: Message): { index: number; total: number } {
  const siblings = siblingsOf(all, message.parentId)
  return {
    index: Math.max(1, siblings.findIndex((m) => m.id === message.id) + 1),
    total: Math.max(1, siblings.length),
  }
}
