'use client'

/**
 * 会话列表的 React 粘合层：装载 / 新建 / 保存 / 删除。
 *
 * 树的操作是纯函数（`session.ts`），存取是 IO（`storage.ts`），这里只做两者的线 ——
 * 界面不直接碰 `vaultFs`，也不自己算 `updatedAt`。
 */
import { useCallback, useEffect, useState } from 'react'
import { createSession, type AgentSession } from './session'
import { deleteSession, listSessions, saveSession } from './storage'

export interface SessionState {
  sessions: AgentSession[]
  loading: boolean
  /** 当前打开的那条（`null` = 还没有会话） */
  active: AgentSession | null
  open: (id: string) => void
  create: () => Promise<void>
  update: (next: AgentSession) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useSessions(): SessionState {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void listSessions()
      .then((list) => {
        if (!alive) return
        setSessions(list)
        setActiveId((current) => current ?? list[0]?.id ?? null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const active = sessions.find((item) => item.id === activeId) ?? null

  const create = useCallback(async () => {
    const session = createSession()
    setSessions((previous) => [session, ...previous])
    setActiveId(session.id)
    // 新建就落盘：用户可能聊两句就走，不该等到下次保存才有这条会话
    await saveSession(session).catch(() => {})
  }, [])

  const update = useCallback(async (next: AgentSession) => {
    setSessions((previous) => {
      const rest = previous.filter((item) => item.id !== next.id)
      return [next, ...rest]
    })
    await saveSession(next).catch((error: unknown) => {
      console.warn('[agent] 会话保存失败', error)
    })
  }, [])

  const remove = useCallback(async (id: string) => {
    setSessions((previous) => previous.filter((item) => item.id !== id))
    setActiveId((current) => (current === id ? null : current))
    await deleteSession(id).catch((error: unknown) => {
      console.warn('[agent] 会话删除失败', error)
    })
  }, [])

  const open = useCallback((id: string) => setActiveId(id), [])

  return { sessions, loading, active, open, create, update, remove }
}
