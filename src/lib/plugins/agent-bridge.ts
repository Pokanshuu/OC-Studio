/**
 * 宿主 → 助手的一次性上下文请求。
 *
 * 条目编辑器点「和助手聊聊」时，容器（`ToolSection`）还没挂载 —— 助手面板
 * 要等导航切过去才出现。所以这里只存一个**待消费**的请求（模块级，不落盘）：
 * 按钮写、`AgentPlugin` 挂载并完成初始化后读。
 *
 * 不直接把图鉴切片塞进来：助手有 `library_read`，让它自己读一遍才是唯一真源
 * （切片装配是导出器的活，见 `docs/Agent接入.md` §3）。这里只传「聊谁」。
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

/** 预填到输入框的第一句话；用户自己按发送，不替用户花 token */
export function agentContextPrompt(request: AgentContextRequest): string {
  return `和我聊聊《${request.title}》这个${KIND_LABEL[request.kind]}。先用 library_read 读一遍（kind=${request.kind}，id=${request.id}），再基于读到的内容说。`
}
