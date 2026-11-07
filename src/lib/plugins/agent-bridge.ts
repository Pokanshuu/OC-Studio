/**
 * 宿主 → 助手的一次性上下文请求。
 *
 * 条目编辑器点「和助手聊聊」时，容器（`ToolSection`）还没挂载 —— 助手面板
 * 要等导航切过去才出现。所以这里只存一个**待消费**的请求（模块级，不落盘）：
 * 按钮写、`AgentPlugin` 挂载并完成初始化后读。
 *
 * 这里只传「聊谁」（kind / id / 标题）。**指令不从这里走**：
 * 2026-11-08 起，这一条以 `focus` 挂进会话资料（`lib/plugins/agent-session.ts`），
 * 由宿主拼进**系统提示词**（`host/session-context.ts`），输入框里只留一句人话。
 * 以前是把「先用 library_read 读一遍（kind=…, id=…）」直接预填进输入框 ——
 * 用户看得见的输入框里不该出现只有宿主才知道的参数。
 */

export type AgentContextKind = 'character' | 'event' | 'country' | 'world'

export interface AgentContextRequest {
  kind: AgentContextKind
  id: number
  title: string
}

const KIND_LABEL: Record<AgentContextKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

let pending: AgentContextRequest | null = null

export function requestAgentContext(request: AgentContextRequest): void {
  pending = request
}

export function takeAgentContext(): AgentContextRequest | null {
  const request = pending
  pending = null
  return request
}

/**
 * 预填到输入框的那一句话：**只有用户意图**（聊这一条），没有工具名与 id。
 * 具体「先读一遍、不要乱改」写在系统提示词的资料块里；用户自己按发送，不替用户花 token。
 */
export function agentContextOpener(request: AgentContextRequest): string {
  return `聊聊《${request.title}》这个${KIND_LABEL[request.kind]}。`
}

/** 会话标题：`关于《…》` */
export function agentContextTitle(request: AgentContextRequest): string {
  return `关于《${request.title}》`
}
