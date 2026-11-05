'use client'

/**
 * 助手会话的存取：`.ocstudio/agents/<id>.json`（Tauri），浏览器退 localStorage。
 *
 * 为什么跟库走：对话是在这个世界的上下文里长出来的，换机器 / 进备份应该跟着。
 * 为什么不进 `worldEntries`：助手对话不是世界观内容，不该出现在词条树、相册、
 * 导出站里（`docs/插件.md` §0.2）。
 *
 * 一个会话一个文件：改一条不会重写整库，也不会因为一条坏 JSON 让所有会话打不开。
 */
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import type { AgentSession } from './session'

const DIR = '.ocstudio/agents'
const LS_KEY = 'oc-agent-sessions-v1'

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

function readLs(): Record<string, AgentSession> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, AgentSession>) : {}
  } catch {
    return {}
  }
}

function writeLs(all: Record<string, AgentSession>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch {
    // 存不下就只在本次会话生效
  }
}

/** 所有会话（按更新时间倒序；坏文件跳过，不连坐） */
export async function listSessions(): Promise<AgentSession[]> {
  const root = vaultRoot()
  if (root !== null) {
    try {
      const assets = await vaultFs.listAssets(root, DIR)
      const files = assets.filter((asset) => asset.name.toLowerCase().endsWith('.json'))
      const out: AgentSession[] = []
      for (const file of files) {
        try {
          const bytes = await vaultFs.readBytes(root, file.relPath)
          const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
          const parsed = JSON.parse(text) as AgentSession
          if (parsed && typeof parsed.id === 'string' && parsed.nodes) out.push(parsed)
        } catch (err) {
          console.warn('[agent] 跳过坏会话文件', file.name, err)
        }
      }
      return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    } catch {
      return []
    }
  }
  return Object.values(readLs()).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function saveSession(session: AgentSession): Promise<void> {
  const root = vaultRoot()
  if (root !== null) {
    const result = await vaultFs.writeTexts(root, [
      { relPath: `${DIR}/${session.id}.json`, content: JSON.stringify(session, null, 2) },
    ])
    const failed = result.find((item) => !item.ok)
    if (failed) throw new Error(failed.error ?? '会话保存失败')
    return
  }
  const all = readLs()
  all[session.id] = session
  writeLs(all)
}

export async function deleteSession(id: string): Promise<void> {
  const root = vaultRoot()
  if (root !== null) {
    await vaultFs.remove(root, `${DIR}/${id}.json`)
    return
  }
  const all = readLs()
  delete all[id]
  writeLs(all)
}
