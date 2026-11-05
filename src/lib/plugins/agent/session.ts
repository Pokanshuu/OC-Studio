/**
 * 助手会话 = **消息树**（`docs/插件.md` §0.2）。
 *
 * 为什么是树不是平铺数组：三个能力平铺做不到 ——
 * - 编辑重发：同一 `parentId` 下再建一个 user 节点，旧分支连同子树保留
 * - 重新生成：同一 user 下再建一个 assistant 节点，多个版本可切换
 * - 上下文压缩：**本地一条不删**，只压缩发给 API 的窗口
 *
 * 这里全是**纯函数**（不碰 React、不碰磁盘、不碰 localStorage）：树的形状错了
 * 是最难回滚的错误，所以先让它在 `scripts/agent-session-check.ts` 里能被逐条断言。
 */
export type AgentRole = 'user' | 'assistant'

export interface MessageNode {
  id: string
  /** `null` = 根（第一条 user） */
  parentId: string | null
  role: AgentRole
  content: string
  createdAt: number
  /** 用了哪个模型（助手节点才有；换模型后旧消息仍记着当时那个） */
  model?: string
}

export interface AgentSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  nodes: Record<string, MessageNode>
  rootId: string | null
  /** 当前看到的那条路径的末端：切分支只改它 */
  leafId: string | null
}

function idOf(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createSession(title = '新对话'): AgentSession {
  const now = Date.now()
  return {
    id: idOf('s'),
    title,
    createdAt: now,
    updatedAt: now,
    nodes: {},
    rootId: null,
    leafId: null,
  }
}

/** 追加一条消息（返回新会话，不改入参）；新节点自动成为当前分支末端 */
export function appendNode(
  session: AgentSession,
  input: { parentId: string | null; role: AgentRole; content: string; model?: string },
): AgentSession {
  const node: MessageNode = {
    id: idOf('m'),
    parentId: input.parentId,
    role: input.role,
    content: input.content,
    createdAt: Date.now(),
    model: input.model,
  }
  return {
    ...session,
    nodes: { ...session.nodes, [node.id]: node },
    rootId: session.rootId ?? node.id,
    leafId: node.id,
    updatedAt: node.createdAt,
  }
}

/** 从根到某个节点的路径（含两端）；节点不存在返回空数组 */
export function pathOf(session: AgentSession, nodeId: string | null): MessageNode[] {
  const out: MessageNode[] = []
  let cursor = nodeId
  const guard = new Set<string>()
  while (cursor !== null) {
    const node = session.nodes[cursor]
    if (!node || guard.has(cursor)) break
    guard.add(cursor)
    out.push(node)
    cursor = node.parentId
  }
  return out.reverse()
}

/** 当前对话（根 → leafId） */
export function currentPath(session: AgentSession): MessageNode[] {
  return pathOf(session, session.leafId)
}

/** 同一父节点下的兄弟（按创建时间，含自己）——分支切换器的数据源 */
export function siblingsOf(session: AgentSession, nodeId: string): MessageNode[] {
  const node = session.nodes[nodeId]
  if (!node) return []
  return Object.values(session.nodes)
    .filter((item) => item.parentId === node.parentId && item.role === node.role)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * 在某条消息处切到第 `offset` 个兄弟（`+1` 后一个 / `-1` 前一个，循环）。
 *
 * 语义是「换个版本看」：只改 `leafId`，**不删任何节点** —— 被换掉的那条连同它
 * 下面的子树都还在，切回来就恢复。
 */
export function switchSibling(session: AgentSession, nodeId: string, offset: number): AgentSession {
  const siblings = siblingsOf(session, nodeId)
  if (siblings.length < 2) return session
  const index = siblings.findIndex((item) => item.id === nodeId)
  if (index < 0) return session
  const next = siblings[(index + offset + siblings.length) % siblings.length]
  return { ...session, leafId: deepestLeaf(session, next.id), updatedAt: Date.now() }
}

/** 某个节点的最末代子孙（切分支后应该停在那一支的末尾，而不是中间） */
export function deepestLeaf(session: AgentSession, nodeId: string): string {
  let cursor = nodeId
  for (;;) {
    const children = Object.values(session.nodes)
      .filter((item) => item.parentId === cursor)
      .sort((a, b) => a.createdAt - b.createdAt)
    const last = children[children.length - 1]
    if (!last) return cursor
    cursor = last.id
  }
}

export interface WindowMessage {
  role: AgentRole
  content: string
}

/**
 * 发给 API 的窗口：保留最近 `keep` 条，更早的折叠成一句提示。
 *
 * 关键：**只影响发出去的内容**，本地消息一条不删（这是消息树存在的理由）。
 */
export function windowFor(session: AgentSession, keep = 20): WindowMessage[] {
  const path = currentPath(session).filter((node) => node.content.trim() !== '')
  const recent = path.slice(-keep)
  const dropped = path.length - recent.length
  const messages: WindowMessage[] = recent.map((node) => ({ role: node.role, content: node.content }))
  if (dropped > 0) {
    messages.unshift({
      role: 'user',
      content: `（此前还有 ${dropped} 条对话，已省略）`,
    })
  }
  return messages
}
