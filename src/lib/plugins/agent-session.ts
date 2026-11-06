/**
 * 会话的「资料范围」：扮演带哪些角色、创作读哪部小说、能不能写回。
 *
 * 存在 localStorage 而不是插件的 SQLite：角色 / 小说的 id 来自笔记库，是宿主
 * 才知道的东西。按会话 id 存一份；未落库的新会话先放 `pending`，等
 * `ensureConversation` 建出 id 再绑过去。
 */

export interface AgentSessionContext {
  /** 本场角色，**第一个是主角**（扮演时由助手扮演）；空数组 = 还没选 */
  characterIds: number[]
  /** 创作读取的小说根条目；`null` = 不读小说 */
  novelRootId: number | null
  /** 创作：允许助手把新章节写回这部小说（每次写入仍要审批） */
  novelWritable: boolean
}

const STORAGE_KEY = 'oc-agent-session-contexts'

let pending: AgentSessionContext | null = null

function readAll(): Record<string, AgentSessionContext> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, AgentSessionContext>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(next: Record<string, AgentSessionContext>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 存不下只影响本次会话，不打断对话
  }
}

export function emptyAgentSessionContext(): AgentSessionContext {
  return { characterIds: [], novelRootId: null, novelWritable: false }
}

export function getAgentSessionContext(conversationId: string | null): AgentSessionContext | null {
  if (!conversationId) return pending
  return readAll()[conversationId] ?? null
}

export function setAgentSessionContext(
  conversationId: string | null,
  context: AgentSessionContext | null,
): void {
  if (!conversationId) {
    pending = context
    return
  }
  const all = readAll()
  if (context) all[conversationId] = context
  else delete all[conversationId]
  writeAll(all)
}

/** 新会话落库后，把 pending 绑到真实 id 上 */
export function bindPendingAgentSessionContext(conversationId: string): void {
  if (!pending) return
  const all = readAll()
  all[conversationId] = pending
  writeAll(all)
  pending = null
}

/** 切笔记库时清掉还没落库的那份资料选择（角色 id 属于旧库） */
export function clearPendingAgentSessionContext(): void {
  pending = null
}

/** 有内容才算「选了资料」 */
export function hasAgentSessionContext(context: AgentSessionContext | null): boolean {
  if (!context) return false
  return context.characterIds.length > 0 || context.novelRootId !== null
}
