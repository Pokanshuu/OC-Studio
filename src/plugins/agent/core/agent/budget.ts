/**
 * Tool-result budgets.
 *
 * Tool output is replayed to the model on **every** following step of the loop,
 * so its cost compounds: a 40k-character `grep` dump is not paid once, it is paid
 * on each of the remaining turns. Clipping is therefore the highest-leverage
 * token saving in the agent — far more than shaving the system prompt.
 *
 * Budgets are deliberately generous enough to keep the conclusion (build logs
 * put it at the tail; `head + tail` keeps both ends), and every clip ends with a
 * one-line note telling the model how to get the rest, so it does not retry the
 * same call blindly.
 *
 * The **displayed** result (UI tool card) keeps the full output; only the copy
 * sent back to the model is clipped. The user can still inspect everything.
 */

export interface ToolBudget {
  /** Max characters kept, including the tail. */
  max: number
  /** Keep this many characters from the start. */
  head?: number
  /** Keep this many characters from the end (build logs end with the verdict). */
  tail?: number
}

/**
 * Per-tool budgets. Anything not listed falls back to `DEFAULT_BUDGET`.
 * Numbers are characters, not tokens: one CJK char ≈ 1 token, one Latin char ≈ ¼.
 */
export const TOOL_BUDGETS: Record<string, ToolBudget> = {
  read_file: { max: 8000 },
  // Code/log greps: the value is in the first few matches; the rest is noise.
  grep: { max: 5000 },
  glob: { max: 5000 },
  list_dir: { max: 5000 },
  // Build output: head has the command echo, tail has pass/fail.
  run_shell: { max: 4000, head: 2000, tail: 2000 },
  fetch_url: { max: 8000 },
  library_list: { max: 4000 },
  library_read: { max: 8000 },
  library_search: { max: 4000 },
  library_graph: { max: 8000 },
  library_templates: { max: 6000 },
}

export const DEFAULT_BUDGET: ToolBudget = { max: 8000 }

function clipNote(kept: number, total: number, hint: string): string {
  return `\n\n…（已截断：只保留 ${kept} / ${total} 字符。${hint}）`
}

/**
 * Clip one tool result to its budget. Idempotent for content inside the budget.
 *
 * `hint` is per-tool advice ("use offset", "narrow the query"), because a generic
 * "truncated" message invites the model to call the same tool again with the same
 * arguments.
 */
export function clipToolResult(toolName: string, content: string): string {
  if (!content) return content
  const budget = TOOL_BUDGETS[toolName] ?? DEFAULT_BUDGET
  if (content.length <= budget.max) return content

  const hint = HINTS[toolName] ?? '换个更窄的查询。'
  if (budget.head !== undefined && budget.tail !== undefined) {
    const head = content.slice(0, budget.head)
    const tail = content.slice(content.length - budget.tail)
    return `${head}${clipNote(budget.head + budget.tail, content.length, hint)}\n\n${tail}`
  }
  return `${content.slice(0, budget.max)}${clipNote(budget.max, content.length, hint)}`
}

const HINTS: Record<string, string> = {
  read_file: '用 offset / limit 接着读。',
  grep: '缩小 pattern 或 include，或加 path。',
  glob: '收窄 pattern。',
  list_dir: '只列子目录。',
  run_shell: '把输出重定向到文件，再用 grep 取结论。',
  fetch_url: '直接取你要的那一段。',
  library_list: '加 kind / category / tag 筛选，或减小 limit。',
  library_read: '用 include_body: true 取全文。',
  library_search: '把查询写具体，或减小 limit。',
  library_graph: '把 hops 降成 1。',
  library_templates: '只看相关分类。',
}
