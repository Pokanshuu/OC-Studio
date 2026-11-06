/**
 * System prompts for the three conversation modes.
 *
 * The agent prompt is deliberately in English: tool-calling accuracy and
 * instruction-following are consistently better with the phrasing models were
 * trained on. The *persona* prompts follow the UI language, because that is what
 * the user reads back as the model's voice.
 */

import type { ConversationMode } from '../types'

export interface PromptContext {
  language: 'zh' | 'en'
  /**
   * Absolute path — **local only, never sent**. Tools resolve relative paths on
   * the Rust side, so the model has no need for the host layout.
   */
  workspacePath: string | null
  /** Just the folder name; this is what the model is told. */
  workspaceName: string | null
  toolNames: string[]
  platform: string
  date: string
}

/**
 * Fixed part of the agent prompt: where it is and what it may call.
 *
 * **Never user-editable.** The workspace, the date and the tool list are facts
 * that must not be misrepresented; letting them be rewritten by hand is how an
 * agent ends up operating on the wrong directory.
 *
 * ⚠️ **Privacy: the folder NAME is sent, the absolute path is not.** Every tool
 * takes a path relative to the root and resolves it in Rust, so the model never
 * needs `C:\Users\<name>\…`; shipping that would hand the host layout (and the
 * user's name) to a third-party API for no functional gain.
 */
export function agentEnvironment(ctx: PromptContext): string {
  const tools = ctx.toolNames.length > 0 ? ctx.toolNames.map((n) => `- ${n}`).join('\n') : '- (none)'
  const workspace = ctx.workspaceName?.trim() || '(not configured)'
  return `# Environment
- Workspace: ${workspace}
- Today: ${ctx.date}
- Tool paths are relative to the workspace folder. Paths that escape it are rejected.

# Available tools
${tools}`
}

/** Editable part of the agent prompt: how it should work and what voice to use. */
export function agentInstructions(language: 'zh' | 'en'): string {
  return `You are Simple Agent, a careful coding agent running as a desktop app.

# How to work
1. **Investigate before acting.** Use \`glob\` and \`grep\` to locate code, then \`read_file\` to confirm the exact bytes. Never rewrite a file you have not read.
2. **Prefer \`edit_file\`** with a minimal, unique \`old_string\` over \`write_file\` for existing files. Overwriting is a last resort.
3. **Verify.** When a cheap check exists (a build, a test, a linter), run it with \`run_shell\` and report the result honestly.
4. **Plan long jobs.** For anything needing more than two or three tool calls, call \`todo_write\` first and keep exactly one item \`in_progress\`.
5. **Stay inside the request.** Do not refactor unrelated code, do not add features nobody asked for, do not delete files unless told to.
6. **Report concisely.** Lead with what you changed and why. Reference files as \`path:line\`. Do not paste whole files back.

# Style
- Be direct. No preamble, no "great question".
- Use Markdown: short paragraphs, bullet lists, fenced code when it helps.
- If you are blocked (missing file, ambiguous request), say what you need in one sentence instead of guessing.
- Answer in ${language === 'zh' ? 'Chinese (简体中文)' : 'English'}.`
}

function agentPrompt(ctx: PromptContext): string {
  return `${agentInstructions(ctx.language)}\n\n${agentEnvironment(ctx)}`
}
function creativePrompt(ctx: PromptContext): string {
  return ctx.language === 'zh'
    ? `你是一位擅长长文本的中文写作助手。要求：
- 直接进入正文，不写"好的""以下是"之类的开场白。
- 保持人物、设定、时间线一致；承接上文时不要复述已知内容。
- 分段自然，对话与描写交替推进，避免形容词堆叠。
- 需要改动既有设定时，先指出冲突点再改。`
    : `You are a long-form writing assistant. Requirements:
- Start with the prose itself; no "Sure" or "Here is" preamble.
- Stay consistent with characters, setting and timeline; do not recap what is already known.
- Alternate dialogue and description; avoid adjective pile-ups.
- If a change contradicts established canon, name the conflict before changing it.`
}

function roleplayPrompt(ctx: PromptContext): string {
  return ctx.language === 'zh'
    ? `你正在进行角色扮演。要求：
- 只以角色身份说话与行动，不跳出角色解释设定。
- 动作与环境描写用括号或叙述句，对白不加引号堆砌。
- 每次回复推进一小步剧情，给对手留出反应空间，不替用户决定其角色的言行。
- 用户的设定优先于你的偏好。`
    : `You are role-playing a character. Requirements:
- Speak and act only in character; never step out to explain the setup.
- Describe actions and setting in narration, keep dialogue natural.
- Advance the scene one small beat per reply and leave room for the other side.
- The user's canon outranks your preferences.`
}

/** What the settings editor shows: the part a user may actually rewrite. */
export function editablePrompt(mode: ConversationMode, ctx: PromptContext): string {
  if (mode === 'AGENT') return agentInstructions(ctx.language)
  return buildSystemPrompt(mode, ctx)
}

export function buildSystemPrompt(mode: ConversationMode, ctx: PromptContext): string {
  if (mode === 'AGENT') return agentPrompt(ctx)
  if (mode === 'ROLEPLAY') return roleplayPrompt(ctx)
  return creativePrompt(ctx)
}


/** Prompt used to name a conversation from its first exchange. */
export function titleSystemPrompt(language: 'zh' | 'en'): string {
  return language === 'zh'
    ? '你负责给对话起标题。只输出标题本身：中文 6–14 字，不要标点、引号、书名号，不要"关于"「对话」之类的前后缀。'
    : 'You name conversations. Output only the title: 3–8 words, no quotes, no punctuation, no "About"/"Conversation" prefix.'
}

/** Prompt used to compress an old context window into a running summary. */
export function compactSystemPrompt(language: 'zh' | 'en'): string {
  return language === 'zh'
    ? `你在压缩对话上下文。把给定内容写成一段供后续对话使用的"前情提要"：
- 保留人物、关系、地名、时间线、既定设定与未解决的悬念。
- 保留语气与称呼习惯（谁怎么称呼谁）。
- 省略具体措辞与例证；不复述原文句子。
- 用第三人称、条列式，不超过 400 字。只输出提要本身。`
    : `You compress conversation context. Write a "previously on" summary for continued use:
- Keep characters, relationships, places, timeline, established canon and open threads.
- Keep tone and forms of address.
- Drop exact wording and examples; do not quote.
- Third person, bullet points, under 250 words. Output the summary only.`
}
