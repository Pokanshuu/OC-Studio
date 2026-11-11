/**
 * Chat state: conversations, the message tree, streaming and the agent loop.
 *
 * Design notes that matter:
 *
 * * **Memory is the UI's single source of truth during a stream.** Deltas mutate
 *   one message; the DB gets a checkpoint every ~2 s and a final write at the
 *   end. Writing every token would mean thousands of transactions per reply.
 * * **Rendering is throttled, not debounced.** A trailing-only debounce would
 *   show nothing until the stream ends (the classic "text appears all at once"
 *   bug). See `throttle()`.
 * * **Structural edits reload from the DB.** Switching a variant replaces the
 *   whole downstream path, so patching the array in place has far more edge cases
 *   than re-reading a few hundred rows.
 */

import { create } from 'zustand'
import { cmd, patchMessage, rowToMessage } from '@/plugins/agent/api/bridge'
import { streamCompletion } from '@/plugins/agent/api/chat'
import { isLibraryTool, libraryAccessGranted, resolveLibraryTool } from '@/plugins/agent/host/library-tools'
import { MERGED_LIBRARY_TOOLS } from '@/lib/capabilities/agent-tools'
import { buildAgentSessionContextBlock, writeNovelChapter } from '@/plugins/agent/host/session-context'
import { bindPendingAgentSessionContext, getAgentSessionContext } from '@/lib/plugins/agent-session'
import {
  buildChatRequest,
  messageToOut,
  type OutMessage,
} from '@/plugins/agent/core/chatRequest'
import {
  finalAnswer,
  finalReasoning,
  runAgentLoop,
  type AgentLoopResult,
  type ApprovalDecision,
} from '@/plugins/agent/core/agent/loop'
import {
  agentEnvironment,
  buildSystemPrompt,
  compactSystemPrompt,
  titleSystemPrompt,
} from '@/plugins/agent/core/agent/prompt'
import { parseToolArgs, toOpenAiTools, toolsFor, type ToolSpec } from '@/plugins/agent/core/agent/tools'
import { chatCompletionsUrl, headersFor } from '@/plugins/agent/core/provider'
import { activePath, siblingsOf } from '@/plugins/agent/core/messageTree'
import { orderedOutgoingMessages } from '@/plugins/agent/core/requestOrdering'
import { debounce, newId, throttle } from '@/plugins/agent/core/util'
import { estimateTokensOfAll } from '@/plugins/agent/core/tokenEstimate'
import { useSettingsStore } from './settings'
import { resolveLang, tFor } from '@/plugins/agent/i18n'
import type {
  AgentStep,
  Attachment,
  Compaction,
  Conversation,
  ConversationMode,
  Message,
  MessageStatus,
  TodoItem,
  ToolCall,
  ToolResult,
} from '@/plugins/agent/core/types'

export type { TodoItem } from '@/plugins/agent/core/types'

const DEFAULT_TITLES = new Set(['新对话', '未命名对话', 'Untitled'])

export interface ApprovalRequest {
  conversationId: string
  call: ToolCall
  resolve: (decision: ApprovalDecision) => void
}

export interface Banner {
  kind: 'info' | 'error'
  text: string
}

/** Tools the user chose to always allow for this session. */
const sessionAllowed = new Set<string>()

/**
 * 审批最多等多久（毫秒）。
 *
 * 审批是插件面板里的一个 Dialog：面板被关掉、或者用户没看见它，这一轮就会永远
 * 停在「等确认」—— 界面看着像卡死，token 却一直在算。到点自动拒绝并给一条横幅。
 */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

/** Stable per-install id for `x-opencode-session` (must not change per request). */
function installId(): string {
  const KEY = 'simple-agent.install-id'
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const created = newId()
    localStorage.setItem(KEY, created)
    return created
  } catch {
    return 'simple-agent-session'
  }
}

interface ChatStore {
  conversations: Conversation[]
  currentId: string | null
  loading: boolean
  allMessages: Message[]

  /** Mode used for the *next* conversation. */
  mode: ConversationMode
  draft: string
  pendingTitle: string | null

  streamingMessageId: string | null
  streamStartedAt: number | null

  compaction: Compaction | null
  compacting: boolean
  compactPreview: string

  approvals: ApprovalRequest[]
  todos: TodoItem[]
  todosMessageId: string | null
  activity: string | null

  /**
   * 最近一次请求里「消息之外」的开销（估算）：系统提示词 + 工具 schema。
   *
   * 只靠消息正文去估上下文会漏掉这一大块 —— AGENT 模式的库手册和十几个工具的
   * schema 加起来往往比几轮对话还大，漏了它百分比就永远是 0。
   *
   * 刻意**不随切会话清零**：切过去多半还是同一种对话，保留上一次的读数比瞬间掉回 0 更可信；
   * 换了模式（AGENT → 创作）时这个值会偏高一点，下一次发送就校正回来。
   */
  overheadTokens: number

  banner: Banner | null

  init: () => Promise<void>
  reloadConversations: () => Promise<void>
  selectConversation: (id: string | null) => Promise<void>
  newConversation: () => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>

  setMode: (mode: ConversationMode) => void
  setDraft: (text: string) => void
  setBanner: (banner: Banner | null) => void
  setWorkspace: (id: string, workspace: string | null) => Promise<void>

  send: (text: string, attachments?: Attachment[]) => Promise<void>
  stop: () => Promise<void>
  /**
   * 异常路径的唯一出口：把这条消息收成 ERROR 并放开输入框。
   *
   * 单独抽出来是因为「一轮对话抛异常」有三个入口（发送 / 重生成 / 改完重发），
   * 以前每个都直接 `await generate(...)`，抛出来就没人收 —— `streamingMessageId`
   * 留在状态里，输入框永远发不出去，看起来就是「助手卡死不输出」。
   */
  failTurn: (messageId: string, error: unknown) => void
  regenerate: (assistantId: string) => Promise<void>
  editAndResend: (userId: string, text: string) => Promise<void>
  removeMessage: (id: string) => Promise<void>
  switchVariant: (messageId: string, direction: -1 | 1) => Promise<void>
  forkFrom: (messageId: string) => Promise<void>

  compact: () => Promise<void>
  clearCompaction: () => Promise<void>
  resolveApproval: (callId: string, decision: ApprovalDecision) => void
}

// ── helpers ─────────────────────────────────────────────────────────────────

function replaceMessage(list: Message[], id: string, patch: Partial<Message>): Message[] {  let changed = false
  const next = list.map((message) => {
    if (message.id !== id) return message
    changed = true
    return { ...message, ...patch }
  })
  return changed ? next : list
}

function cloneSteps(steps: AgentStep[]): AgentStep[] {
  return steps.map((step) => ({
    ...step,
    toolCalls: step.toolCalls.map((call) => ({ ...call })),
  }))
}

function pathOf(all: Message[]): Message[] {
  return activePath(all)
}

/** Compose the final system prompt: mode persona + host context + presets + user prompt. */
function systemPromptFor(
  conversation: Conversation,
  workspace: string | null,
  hostContext = '',
): string {
  const settings = useSettingsStore.getState().settings
  const presets = useSettingsStore.getState().presets
  const language = resolveLang(settings.ui.language)

  const ctx = {
    language,
    workspacePath: workspace,
    workspaceName: workspace ? (workspace.split(/[\\/]/).filter(Boolean).pop() ?? null) : null,
    toolNames: toolsFor(settings.agent.enabledTools).map((tool) => tool.name),
    platform: navigator.userAgent.includes('Windows') ? 'Windows' : navigator.platform,
    date: new Date().toISOString().slice(0, 10),
    // 创作 / 扮演才用得上；AGENT 的 buildSystemPrompt 会忽略它
    writingSkills: settings.writingSkills,
  } as const

  // A user-written prompt replaces the persona, but the agent still needs to be
  // told where it is — the environment block is data, not persona.
  const custom = settings.systemPrompts?.[conversation.mode]?.trim() ?? ''
  const base = custom
    ? conversation.mode === 'AGENT'
      ? `${custom}\n\n${agentEnvironment(ctx)}`
      : custom
    : buildSystemPrompt(conversation.mode, ctx)

  const parts: string[] = [base]
  // 设定资料（扮演 / 创作）：数据段放在人设之后、用户预设之前
  if (hostContext.trim()) parts.push(hostContext.trim())
  for (const preset of presets) {
    if (settings.enabledPresets.includes(preset.id) && preset.content.trim()) {
      parts.push(preset.content.trim())
    }
  }
  if (conversation.systemPrompt?.trim()) parts.push(conversation.systemPrompt.trim())
  if (settings.systemPrompt.trim()) parts.push(settings.systemPrompt.trim())
  return parts.filter((part) => part.length > 0).join('\n\n')
}

function isAutoTitle(title: string): boolean {
  return DEFAULT_TITLES.has(title) || title.trim().length === 0
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')
    .replace(/^["'“”‘’「」《》]+|["'“”‘’「」《》]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Convert a finished turn into the row of stats the UI shows. */
function statsFor(startedAt: number, firstTokenAt: number | null, steps: AgentStep[]) {
  const tokensOut = steps.reduce((sum, step) => sum + (step.usage?.completionTokens ?? 0), 0)
  const elapsedMs = Date.now() - startedAt
  const ttftMs = firstTokenAt ? firstTokenAt - startedAt : null
  const tps = tokensOut > 0 && elapsedMs > 0 ? tokensOut / (elapsedMs / 1000) : null
  return { tokensOut: tokensOut > 0 ? tokensOut : null, ttftMs, tps }
}

const draftPersist = debounce((conversationId: string, text: string) => {
  void cmd.saveDraft(conversationId, text).catch(() => undefined)
}, 400)

// ── store ───────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => {
  /** Abort handle of the running generation. */
  let abort: AbortController | null = null

  async function reload(): Promise<void> {
    const conversationId = get().currentId
    if (!conversationId) {
      set({ allMessages: [] })
      return
    }
    const rows = await cmd.loadMessages(conversationId)
    // 加载期间用户已经切走（切库 / 新对话 / 选另一条）：这份结果不能写回，
    // 否则旧库的消息会落到空的新会话上，出现「侧栏没有会话、正文却有一大段」
    if (get().currentId !== conversationId) return
    set({ allMessages: rows.map(rowToMessage) })
  }

  async function ensureConversation(): Promise<Conversation> {
    const existingId = get().currentId
    if (existingId) {
      const found = get().conversations.find((c) => c.id === existingId)
      if (found) return found
      // Deleted elsewhere (or stale id): fall through and create a new one.
      set({ currentId: null, allMessages: [] })
    }

    const settings = useSettingsStore.getState().settings
    const mode = get().mode
    const created = await cmd.createConversation({
      mode,
      provider: settings.api.provider,
      model: settings.api.model,
      systemPrompt: null,
      workspace: settings.agent.workspace,
      title: get().pendingTitle ?? null,
    })
    set((state) => ({
      conversations: [created, ...state.conversations],
      currentId: created.id,
      pendingTitle: null,
    }))
    // 「和新会话聊之前选好的资料」绑到真实 id 上
    bindPendingAgentSessionContext(created.id)
    void cmd.clearDraftTitle('').catch(() => undefined)
    return created
  }

  /** One assistant turn: build → stream → (tools) → finalise. */
  async function generate(assistantId: string, conversationId: string): Promise<void> {
    const settings = useSettingsStore.getState().settings
    const conversation = get().conversations.find((c) => c.id === conversationId)
    if (!conversation) return

    // 工作目录固定为当前笔记库（宿主在 AgentPlugin 里写死），
    // 会话上的旧 workspace 一律不再生效 —— 换库之后不能再读旧目录。
    const workspace = settings.agent.workspace
    const isAgent = conversation.mode === 'AGENT'
    const sessionContext = getAgentSessionContext(conversationId)
    const novelWritable =
      conversation.mode === 'CREATIVE' &&
      Boolean(sessionContext?.novelWritable) &&
      sessionContext?.novelRootId != null
    // agent：全套工具；创作：只给「写回新章节」这一件；扮演：不给工具。
    const toolsAllowed = isAgent || novelWritable
    // 宿主没授权「读实体」时，这些工具**不发给模型**：广告了却调不动，
    // 模型会反复试、再花一轮解释为什么失败。
    const libraryAllowed = libraryAccessGranted()
    const tools: ToolSpec[] = toolsAllowed && workspace
      ? toolsFor(settings.agent.enabledTools).filter((tool) => {
          if (conversation.mode === 'CREATIVE') return tool.name === 'novel_write_chapter'
          // 写小说章节也是写库：没拿到库授权时同样不要广告它。
          // （它不在 `LIBRARY_TOOL_NAMES` 里，因为执行落在宿主自己的小说服务上，
          //   `isLibraryTool` 认不出来 —— 这里必须点名，否则「没授权也能看见」，模型会去调。）
          if (tool.name === 'novel_write_chapter') return libraryAllowed
          return libraryAllowed || !isLibraryTool(tool.name)
        })
      : []

    const path = pathOf(get().allMessages).filter((m) => m.id !== assistantId)
    const outgoing = orderedOutgoingMessages(path, get().compaction)
    const history: OutMessage[] = []
    const systemPrompt = systemPromptFor(
      conversation,
      workspace,
      await buildAgentSessionContextBlock(conversation.mode, conversationId),
    )
    if (systemPrompt.trim()) {
      history.push({ role: 'system', content: systemPrompt })
    }
    // 记下这次请求「消息之外」占了多少：系统提示词 + 工具 schema（上下文百分比要用）
    set({
      overheadTokens: estimateTokensOfAll([
        systemPrompt,
        tools.length > 0 ? JSON.stringify(toOpenAiTools(tools)) : '',
      ]),
    })
    for (const message of outgoing) history.push(...messageToOut(message))

    const controller = new AbortController()
    abort = controller

    const startedAt = Date.now()
    let firstTokenAt: number | null = null
    let lastCheckpoint = startedAt

    // Live view of the run; published to the UI on a 50 ms cadence.
    const steps: AgentStep[] = []
    const publish = throttle(() => {
      // Shallow copy of the steps array only. A deep clone per tick allocated a
      // fresh object graph 20×/second, which is where the streaming jank came
      // from; the step objects themselves are mutated in place by the loop.
      const patch: Partial<Message> = {
        content: finalAnswer(steps),
        reasoning: finalReasoning(steps),
        steps: steps.slice(),
      }
      set((state) => ({ allMessages: replaceMessage(state.allMessages, assistantId, patch) }))

      const now = Date.now()
      if (now - lastCheckpoint > 2000) {
        lastCheckpoint = now
        void patchMessage(assistantId, {
          content: patch.content,
          reasoning: patch.reasoning,
          steps: patch.steps,
        }).catch(() => undefined)
      }
    }, 33)

    let failure: string | null = null

    /**
     * 跑这一轮。
     *
     * **必须兜住异常**：以前这里是裸 `await`，`runAgentLoop` 里任何一个意料之外的
     * 抛出（工具回调、事件序列化、插件侧 IPC 抖动）都会让 `generate` 提前结束，
     * 而收尾代码（把 `streamingMessageId` 清掉、把消息标成 ERROR）永远不执行 ——
     * 表现就是「助手卡住不再输出、输入框也发不出去」，只能切会话或重启才能恢复。
     * 现在异常变成一条 ERROR 消息，界面立刻可继续用。
     */
    let result: AgentLoopResult = { steps: [], error: null, stopped: false, exhausted: false }
    try {
      result = await runAgentLoop({
      history,
      tools,
      // 旧工具名要继承合并后工具的审批属性，否则会绕过审批直接执行
      resolveTool: (name) => {
        const canonical = (MERGED_LIBRARY_TOOLS as Record<string, string>)[name] ?? name
        return tools.find((tool) => tool.name === canonical)
      },
      // 0 = 不限步数：现代模型基本不会无意义地空转，真正的刹车是用户按停止。
      maxSteps: toolsAllowed && workspace ? (settings.agent.maxSteps > 0 ? settings.agent.maxSteps : Number.POSITIVE_INFINITY) : 1,
      signal: controller.signal,
      buildBody: (messages, specs) =>
        buildChatRequest({
          provider: settings.api.provider,
          modelId: settings.api.model,
          messages,
          reasoning: settings.api.thinking,
          temperature: settings.api.temperature,
          topP: settings.api.topP,
          maxTokens: settings.api.maxTokens,
          tools: specs,
        }),
      stream: async (body, signal, onEvent) => {
        await streamCompletion({
          url: chatCompletionsUrl(settings.api.baseUrl),
          headers: headersFor(settings.api.provider, installId()),
          body,
          signal,
          onEvent: (event) => {
            if (event.type === 'content' && firstTokenAt === null) firstTokenAt = Date.now()
            if (event.type === 'error') failure = event.message
            onEvent(event)
          },
        })
      },
      approve: async (call) => {
        const policy = useSettingsStore.getState().settings.agent.approval
        if (policy === 'auto') return 'allow'
        if (policy === 'never') return 'deny'
        if (sessionAllowed.has(call.name)) return 'allow'
        return new Promise<ApprovalDecision>((resolve) => {
          /**
           * 没人回答时不能挂一辈子。
           *
           * 审批弹窗是插件面板里的一个 Dialog：面板被关掉、或者用户压根没看见它，
           * 这一轮就永远停在「等确认」——界面看着就是「助手卡住不输出了」，
           * 而且 token 一直在计。到点自动拒绝，并留一条看得懂的横幅。
           */
          const timer = setTimeout(() => {
            set((state) => ({ approvals: state.approvals.filter((item) => item.call.id !== call.id) }))
            const language = resolveLang(useSettingsStore.getState().settings.ui.language)
            set({ banner: { kind: 'info', text: tFor(language)('agent.approvalTimeout') } })
            resolve('deny')
          }, APPROVAL_TIMEOUT_MS)
          const resolveOnce = (decision: ApprovalDecision) => {
            clearTimeout(timer)
            resolve(decision)
          }
          set((state) => ({
            approvals: [...state.approvals, { conversationId, call, resolve: resolveOnce }],
          }))
        })
      },
      execute: async (call) => {
        // 合并掉的旧工具名不在 `tools` 里（提示词只发新名），但历史记录 / 模型
        // 记忆里可能还留着旧名。先映射到接手的工具再找 spec：
        // 否则会先被判成 Unknown tool，连审批与执行都走不到（`library_import_image` 就这样）。
        const canonicalName = (MERGED_LIBRARY_TOOLS as Record<string, string>)[call.name] ?? call.name
        const spec = tools.find((tool) => tool.name === canonicalName)
        if (!spec) {
          return {
            content: `Unknown tool: ${call.name}`,
            isError: true,
            durationMs: 0,
          } satisfies ToolResult
        }
        set({ activity: call.name })
        const args = parseToolArgs(call.args)
        try {
          // 宿主优先：设定库那几个工具在进程内执行，其余落回插件的文件工具层
          const hosted = await resolveLibraryTool(call.name, args)
          const response = hosted ??
            (call.name === 'novel_write_chapter'
              ? await writeNovelChapter(conversationId, args)
              : await cmd.runTool(call.name, args, workspace ?? ''))
          void cmd
            .auditToolCall(conversationId, call.name, call.args, !response.isError, response.durationMs)
            .catch(() => undefined)
          if (call.name === 'todo_write' && Array.isArray(args.todos)) {
            set({ todos: args.todos as TodoItem[], todosMessageId: assistantId })
          }
          return {
            content: response.content,
            isError: response.isError,
            data: response.data,
            durationMs: response.durationMs,
          }
        } catch (error) {
          return {
            content: error instanceof Error ? error.message : String(error),
            isError: true,
            durationMs: 0,
          } satisfies ToolResult
        } finally {
          set({ activity: null })
        }
      },
      onStepStart: (step) => {
        steps.push(step)
        publish()
      },
      onDelta: (delta) => {
        const step = steps[delta.stepIndex]
        if (!step) return
        if (delta.content !== undefined) step.content = delta.content
        if (delta.reasoning !== undefined) step.reasoning = delta.reasoning
        if (delta.toolCalls !== undefined) {
          step.toolCalls = delta.toolCalls.map((call) => ({ ...call, status: call.status ?? 'pending' }))
        }
        publish()
      },
      onToolUpdate: (_index, call) => {
        const step = steps.find((candidate) => candidate.toolCalls.some((c) => c.id === call.id))
        if (step) {
          step.toolCalls = step.toolCalls.map((c) => (c.id === call.id ? { ...call } : c))
          publish()
        }
      },
      })
    } catch (error) {
      result = {
        steps,
        error: error instanceof Error ? error.message : String(error),
        stopped: false,
        exhausted: false,
      }
    }

    publish.flush()

    const content = finalAnswer(steps)
    const reasoning = finalReasoning(steps)
    const { ttftMs, tps, tokensOut } = statsFor(startedAt, firstTokenAt, steps)

    let status: MessageStatus = 'DONE'
    let errorMessage: string | null = null
    if (result.error || failure) {
      status = 'ERROR'
      errorMessage = result.error ?? failure
    } else if (result.stopped) {
      status = 'STOPPED'
    } else if (result.exhausted && content.length === 0) {
      status = 'STOPPED'
    }

    const thinkingMs =
      reasoning.length > 0
        ? Math.max(1000, (firstTokenAt ?? Date.now()) - startedAt)
        : null

    await patchMessage(assistantId, {
      content,
      reasoning,
      steps,
      status,
      errorMessage,
      model: settings.api.model,
      ttftMs: ttftMs ?? undefined,
      tps: tps ?? undefined,
      thinkingMs: thinkingMs ?? undefined,
      tokensOut: tokensOut ?? undefined,
    }).catch(() => undefined)

    set((state) => ({
      allMessages: replaceMessage(state.allMessages, assistantId, {
        content,
        reasoning: reasoning || null,
        steps: cloneSteps(steps),
        status,
        errorMessage,
        model: settings.api.model,
        ttftMs,
        tps,
        thinkingMs,
        tokensOut,
      }),
      streamingMessageId: null,
      activity: null,
    }))

    abort = null
    // Pending approvals must not outlive the run.
    for (const pending of get().approvals) {
      if (pending.conversationId === conversationId) pending.resolve('deny')
    }
    set({ approvals: [] })

    void get().reloadConversations()

    if (result.exhausted && content.length > 0) {
      set({ banner: { kind: 'info', text: tFor(resolveLang(settings.ui.language))('agent.exhausted') } })
    }

    // First exchange of an auto-titled conversation → name it.
    if (status === 'DONE' && content.length > 0 && useSettingsStore.getState().settings.autoTitle) {
      const latest = get().conversations.find((c) => c.id === conversationId)
      if (latest && isAutoTitle(latest.title)) {
        void autoTitle(conversationId, path, content)
      }
    }
  }

  async function autoTitle(
    conversationId: string,
    history: Message[],
    reply: string,
  ): Promise<void> {
    const settings = useSettingsStore.getState().settings
    const language = resolveLang(settings.ui.language)
    const firstUser = history.find((m) => m.role === 'user')
    if (!firstUser) return

    const material = `用户：${firstUser.content.slice(0, 600)}\n\n助手：${reply.slice(0, 600)}`
    let title = ''
    try {
      await streamCompletion({
        url: chatCompletionsUrl(settings.api.baseUrl),
        headers: headersFor(settings.api.provider, installId()),
        body: buildChatRequest({
          provider: settings.api.provider,
          modelId: settings.api.model,
          messages: [
            { role: 'system', content: titleSystemPrompt(language) },
            { role: 'user', content: material },
          ],
          reasoning: 'off',
          temperature: 0.3,
          topP: 1,
          maxTokens: 40,
        }),
        signal: new AbortController().signal,
        onEvent: (event) => {
          if (event.type === 'content') title += event.text
        },
      })
    } catch {
      return
    }
    const cleaned = cleanTitle(title)
    if (!cleaned) return
    await cmd.updateConversation(conversationId, { title: cleaned })
    await get().reloadConversations()
  }

  return {
    conversations: [],
    currentId: null,
    loading: true,
    allMessages: [],
    mode: 'CREATIVE',
    draft: '',
    pendingTitle: null,
    streamingMessageId: null,
    streamStartedAt: null,
    compaction: null,
    compacting: false,
    compactPreview: '',
    approvals: [],
    todos: [],
    todosMessageId: null,
    activity: null,
    banner: null,
    overheadTokens: 0,

    init: async () => {
      await get().reloadConversations()
      const stored = await cmd.getDraft('').catch(() => null)
      set({ loading: false, pendingTitle: stored?.title ?? null, draft: stored?.text ?? '' })

      // Reopen whatever was on screen last time — a desktop window that forgets
      // where you were is annoying, and the draft is restored with it.
      const last = useSettingsStore.getState().settings.ui.lastConversationId
      if (last && get().conversations.some((c) => c.id === last)) {
        await get().selectConversation(last)
      }
    },

    reloadConversations: async () => {
      const conversations = await cmd.listConversations()
      set({ conversations })
    },

    selectConversation: async (id) => {
      if (get().streamingMessageId) await get().stop()
      draftPersist.flush()

      set({ currentId: id, allMessages: [], draft: '', todos: [], compactPreview: '' })
      useSettingsStore.getState().patch((current) => ({
        ...current,
        ui: { ...current.ui, lastConversationId: id },
      }))
      if (!id) {
        const stored = await cmd.getDraft('').catch(() => null)
        set({ draft: stored?.text ?? '', pendingTitle: stored?.title ?? null })
        return
      }

      const [rows, compaction, draft] = await Promise.all([
        cmd.loadMessages(id),
        cmd.getCompaction(id).catch(() => null),
        cmd.getDraft(id).catch(() => null),
      ])
      // 加载期间切走了：这份结果属于旧会话，写回去就会把旧消息安到新会话上
      if (get().currentId !== id) return
      const conversation = get().conversations.find((c) => c.id === id)
      set({
        allMessages: rows.map(rowToMessage),
        compaction,
        draft: draft?.text ?? '',
        mode: conversation?.mode ?? get().mode,
      })
    },

    newConversation: async () => {
      if (get().streamingMessageId) await get().stop()
      draftPersist.flush()
      set({ currentId: null, allMessages: [], compaction: null, todos: [], draft: '' })
      // 别让下一次启动 / 下次切库又把上一条恢复回来
      useSettingsStore.getState().patch((current) => ({
        ...current,
        ui: { ...current.ui, lastConversationId: null },
      }))
      const stored = await cmd.getDraft('').catch(() => null)
      set({ draft: stored?.text ?? '', pendingTitle: stored?.title ?? null })
    },

    renameConversation: async (id, title) => {
      const trimmed = title.trim()
      if (!trimmed) return
      await cmd.updateConversation(id, { title: trimmed })
      await get().reloadConversations()
    },

    togglePin: async (id) => {
      const conversation = get().conversations.find((c) => c.id === id)
      if (!conversation) return
      await cmd.updateConversation(id, { pinned: !conversation.pinned })
      await get().reloadConversations()
    },

    deleteConversation: async (id) => {
      if (get().currentId === id) {
        set({ currentId: null, allMessages: [], compaction: null })
      }
      await cmd.deleteConversation(id)
      await get().reloadConversations()
    },

    setMode: (mode) => set({ mode }),

    setDraft: (text) => {
      set({ draft: text })
      draftPersist(get().currentId ?? '', text)
    },

    setBanner: (banner) => set({ banner }),

    setWorkspace: async (id, workspace) => {
      await cmd.updateConversation(id, { workspace })
      await get().reloadConversations()
    },

    send: async (text, attachments = []) => {
      if (get().streamingMessageId) return
      const body = text.trim()
      if (!body && attachments.length === 0) return

      const conversation = await ensureConversation()
      const settings = useSettingsStore.getState().settings
      const path = pathOf(get().allMessages)
      const parentId = path.length > 0 ? path[path.length - 1].id : ''

      const userRow = await cmd.appendMessage({
        conversationId: conversation.id,
        parentId,
        role: 'user',
        content: body,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
      })
      const userMessage = rowToMessage(userRow)

      const assistantRow = await cmd.appendMessage({
        conversationId: conversation.id,
        parentId: userMessage.id,
        role: 'assistant',
        content: '',
        status: 'STREAMING',
        model: settings.api.model,
      })
      const assistant = rowToMessage(assistantRow)
      set((state) => ({
        allMessages: [...state.allMessages, userMessage, assistant],
        draft: '',
        streamingMessageId: assistant.id,
        streamStartedAt: Date.now(),
        todos: [],
      }))
      draftPersist('', '')
      draftPersist.flush()

      try {
        await generate(assistant.id, conversation.id)
      } catch (error) {
        // generate 在进入循环**之前**也可能抛（拼提示词、读库、落消息）。
        // 那些路径不归它内部的 try 管，异常若漏到这里，`streamingMessageId`
        // 就永远留在状态里 —— 输入框发不出去、界面看着像卡死。这里兜住并显性报错。
        get().failTurn(assistant.id, error)
      }
    },

    failTurn: (messageId, error) => {
      const message = error instanceof Error ? error.message : String(error)
      // 未决的审批一起放掉：那一轮已经结束了，留着只会挂住一个再也无人回答的弹窗
      for (const pending of get().approvals) pending.resolve('deny')
      set((state) => ({
        streamingMessageId: null,
        activity: null,
        approvals: [],
        allMessages: replaceMessage(state.allMessages, messageId, {
          status: 'ERROR',
          errorMessage: message,
        }),
      }))
      void patchMessage(messageId, { status: 'ERROR', errorMessage: message }).catch(() => undefined)
    },

    stop: async () => {
      abort?.abort()
      abort = null
      // Release anything waiting on the user so the loop can unwind.
      for (const pending of get().approvals) pending.resolve('deny')
      set({ approvals: [], streamingMessageId: null })
    },

    regenerate: async (assistantId) => {
      if (get().streamingMessageId) return
      const conversationId = get().currentId
      if (!conversationId) return

      const conversation = get().conversations.find((c) => c.id === conversationId)
      if (conversation?.mode === 'AGENT') {
        // An agent turn may have written files or run commands; replaying it
        // would silently duplicate those side effects. Guarded here as well as in
        // the UI so no other call path can slip through.
        const language = resolveLang(useSettingsStore.getState().settings.ui.language)
        set({ banner: { kind: 'info', text: tFor(language)('agent.historyLocked') } })
        return
      }

      const target = get().allMessages.find((m) => m.id === assistantId)
      if (!target) return

      const settings = useSettingsStore.getState().settings
      const row = await cmd.appendMessage({
        conversationId,
        parentId: target.parentId,
        role: 'assistant',
        content: '',
        status: 'STREAMING',
        model: settings.api.model,
      })

      // The new sibling wins the `active` flag; the old branch keeps its subtree.
      // Reloading (instead of appending) is what makes the path end at the new row.
      await reload()
      set({ streamingMessageId: row.id, streamStartedAt: Date.now() })
      try {
        await generate(row.id, conversationId)
      } catch (error) {
        get().failTurn(row.id, error)
      }
    },

    editAndResend: async (userId, text) => {
      if (get().streamingMessageId) return
      const conversationId = get().currentId
      if (!conversationId) return

      const conversation = get().conversations.find((c) => c.id === conversationId)
      if (conversation?.mode === 'AGENT') {
        // Same reason as `regenerate`: replaying an agent turn re-runs its tools.
        const language = resolveLang(useSettingsStore.getState().settings.ui.language)
        set({ banner: { kind: 'info', text: tFor(language)('agent.historyLocked') } })
        return
      }

      const target = get().allMessages.find((m) => m.id === userId)
      if (!target) return

      const settings = useSettingsStore.getState().settings
      // Editing creates a *new user version* under the same parent: the old
      // branch, including everything the model answered, stays reachable.
      const userRow = await cmd.appendMessage({
        conversationId,
        parentId: target.parentId,
        role: 'user',
        content: text,
        attachments: target.attachments.length > 0 ? JSON.stringify(target.attachments) : null,
      })
      const userMessage = rowToMessage(userRow)

      const assistantRow = await cmd.appendMessage({
        conversationId,
        parentId: userMessage.id,
        role: 'assistant',
        content: '',
        status: 'STREAMING',
        model: settings.api.model,
      })

      await reload()
      set({ streamingMessageId: assistantRow.id, streamStartedAt: Date.now() })
      try {
        await generate(assistantRow.id, conversationId)
      } catch (error) {
        get().failTurn(assistantRow.id, error)
      }
    },

    removeMessage: async (id) => {
      if (get().streamingMessageId) return
      const conversation = get().conversations.find((c) => c.id === get().currentId)
      if (conversation?.mode === 'AGENT') {
        // The transcript is the agent's working memory: deleting a turn removes
        // the questions the later answers were produced from.
        const language = resolveLang(useSettingsStore.getState().settings.ui.language)
        set({ banner: { kind: 'info', text: tFor(language)('agent.historyLocked') } })
        return
      }
      await cmd.deleteSubtree(id)
      await reload()
      await get().reloadConversations()
    },

    switchVariant: async (messageId, direction) => {
      if (get().streamingMessageId) return
      const conversationId = get().currentId
      if (!conversationId) return
      const message = get().allMessages.find((m) => m.id === messageId)
      if (!message) return

      const siblings = siblingsOf(get().allMessages, message.parentId)
      const index = siblings.findIndex((m) => m.id === messageId)
      if (index < 0) return
      const next = siblings[index + direction]
      if (!next) return

      await cmd.setActiveVariant(conversationId, message.parentId, next.id)
      await reload()
    },

    forkFrom: async (messageId) => {
      const conversationId = get().currentId
      if (!conversationId) return
      const created = await cmd.forkConversation(conversationId, messageId)
      if (!created) return
      await get().reloadConversations()
      await get().selectConversation(created.id)
    },

    compact: async () => {
      const conversationId = get().currentId
      if (!conversationId || get().streamingMessageId || get().compacting) return

      const settings = useSettingsStore.getState().settings
      const language = resolveLang(settings.ui.language)
      const path = pathOf(get().allMessages)
      const existing = get().compaction
      const alreadyCovered = existing
        ? path.findIndex((m) => m.id === existing.throughMessageId)
        : -1
      const candidates = path
        .filter((_m, index) => index > alreadyCovered)
        .filter((m) => m.status !== 'STREAMING' && m.content.trim().length > 0)

      const keep = Math.max(2, settings.compactKeepRecent)
      if (candidates.length <= keep) {
        set({ banner: { kind: 'info', text: tFor(language)('composer.compactTooFew') } })
        return
      }

      let cut = candidates.length - keep
      // The kept tail must start with a user message, otherwise the request opens
      // with an answer that has no question.
      while (cut > 0 && candidates[cut].role !== 'user') cut--
      if (cut <= 0) {
        set({ banner: { kind: 'info', text: tFor(language)('composer.compactTooFew') } })
        return
      }

      const toSummarize = candidates.slice(0, cut)
      const throughId = toSummarize[toSummarize.length - 1].id
      const previous = existing?.summary?.trim()

      set({ compacting: true, compactPreview: '', banner: null })

      // 这一步会走网络：以前没有任何 catch，抛出来 `compacting` 就一直是 true，
      // 「压缩上下文」按钮永远转圈、还把后续发送一起挡住（与 generate 同一类问题）。
      try {
        const transcript: string[] = []
        if (previous) transcript.push(`(已有提要)\n${previous}\n\n(新增内容)`)
        for (const message of toSummarize) {
          const speaker = message.role === 'user' ? '用户' : '助手'
          transcript.push(`${speaker}：${message.content.trim()}`)
          for (const attachment of message.attachments) {
            if (attachment.kind === 'text' && attachment.data) {
              transcript.push(attachment.data)
            } else if (attachment.kind === 'image') {
              transcript.push('(附图)')
            }
          }
        }

        let summary = ''
        let failure: string | null = null
        await streamCompletion({
          url: chatCompletionsUrl(settings.api.baseUrl),
          headers: headersFor(settings.api.provider, installId()),
          body: buildChatRequest({
            provider: settings.api.provider,
            modelId: settings.api.model,
            messages: [
              { role: 'system', content: compactSystemPrompt(language) },
              { role: 'user', content: transcript.join('\n\n') },
            ],
            reasoning: 'off',
            temperature: 0.3,
            topP: 1,
            maxTokens: null,
          }),
          signal: new AbortController().signal,
          onEvent: (event) => {
            if (event.type === 'content') {
              summary += event.text
              set({ compactPreview: summary })
            }
            if (event.type === 'error') failure = event.message
          },
        })

        if (failure || !summary.trim()) {
          set({
            compacting: false,
            compactPreview: '',
            banner: { kind: 'error', text: failure ?? tFor(language)('error.empty') },
          })
          return
        }

        const saved = await cmd.saveCompaction(conversationId, throughId, summary.trim())
        set({ compaction: saved, compacting: false, compactPreview: '' })
      } catch (error) {
        // 网络 / 存储出错也要把按钮放回来，并说清是哪一步失败
        set({
          compacting: false,
          compactPreview: '',
          banner: { kind: 'error', text: error instanceof Error ? error.message : String(error) },
        })
      }
    },

    clearCompaction: async () => {
      const conversationId = get().currentId
      if (!conversationId) return
      await cmd.deleteCompaction(conversationId)
      set({ compaction: null })
    },

    resolveApproval: (callId, decision) => {
      const pending = get().approvals.find((item) => item.call.id === callId)
      if (!pending) return
      if (decision === 'always') sessionAllowed.add(pending.call.name)
      pending.resolve(decision)
      set((state) => ({ approvals: state.approvals.filter((item) => item.call.id !== callId) }))
    },
  }
})
