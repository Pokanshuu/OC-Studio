/**
 * Turn "active path + compaction state" into the message list actually sent.
 *
 * Pure on purpose: a bug here only shows up as "the model answers something
 * unrelated", which is nearly impossible to trace from the UI.
 *
 * The path is already ordered (`activePath`), so this only filters:
 *
 * 1. skip messages still streaming, and messages with **neither text nor
 *    attachments**
 * 2. skip everything the compaction already covers — its summary replaces them
 * 3. **the first message must be from the user**; starting with an assistant
 *    turn is an answer without a question
 */

import type { Compaction, Message } from './types'

function hasPayload(message: Message): boolean {
  return message.content.trim().length > 0 || message.attachments.length > 0
}

export function orderedOutgoingMessages(
  path: Message[],
  compaction: Compaction | null,
): Message[] {
  // Where the summary stops on this path; if the id is not on the path the
  // compaction belongs to another branch and must be ignored entirely.
  const coveredIndex = compaction
    ? path.findIndex((m) => m.id === compaction.throughMessageId)
    : -1

  const filtered = path
    .filter((m) => m.status !== 'STREAMING')
    // The test is "is there anything to send", not "is the text non-empty": a
    // user message that only carries an attachment (the most natural way to say
    // "look at this") has empty content but is still the whole point.
    .filter(hasPayload)
    .filter((_m, index) => coveredIndex < 0 || index > coveredIndex)

  const firstUser = filtered.findIndex((m) => m.role === 'user')
  if (firstUser < 0) return []
  return firstUser === 0 ? filtered : filtered.slice(firstUser)
}

/** Token accounting helper: text + text-attachment bodies of one message. */
export function messageTextForTokens(message: Message): string {
  const parts = [message.content]
  for (const attachment of message.attachments) {
    if (attachment.kind === 'text' && attachment.data) parts.push(attachment.data)
  }
  return parts.join('\n\n')
}
