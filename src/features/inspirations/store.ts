'use client'

/**
 * 灵感的读写：`.ocstudio/inspirations.json` 优先，浏览器预览退 localStorage。
 *
 * 与 `lib/categories/store.ts` 同一套形态（快照 + 订阅 + 逐次落盘），因为它是
 * 同一种东西：**库级的小表**，不是实体。区别只有一处 —— 灵感内容是作者写的字，
 * 所以写失败必须抛出来让界面提示，不能像分类那样静默回落。
 */
import { useSyncExternalStore } from 'react'
import { vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import {
  EMPTY_INSPIRATION_CONTENT,
  INSPIRATIONS_LS_KEY,
  INSPIRATIONS_REL_PATH,
  newInspirationId,
  normalizeInspirations,
  parseInspirations,
  serializeInspirations,
  type Inspiration,
} from './types'

let snapshot: Inspiration[] = []
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function root(): string | null {
  const session = getVaultSession()
  return session === null ? null : session.root
}

function setSnapshot(items: Inspiration[]): void {
  snapshot = items
  emit()
}

async function persist(items: Inspiration[]): Promise<void> {
  setSnapshot(items)
  const vaultRoot = root()
  if (vaultRoot !== null) {
    try {
      await vaultFs.mkdir(vaultRoot, '.ocstudio')
    } catch {
      // 目录已存在
    }
    const results = await vaultFs.writeTexts(vaultRoot, [
      { relPath: INSPIRATIONS_REL_PATH, content: serializeInspirations(items) },
    ])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入灵感失败')
    return
  }
  if (typeof window !== 'undefined') localStorage.setItem(INSPIRATIONS_LS_KEY, serializeInspirations(items))
}

/** 首次读盘（有文件夹走文件，否则 localStorage）。可重复调用。 */
export function loadInspirations(): Promise<void> {
  if (loaded) return Promise.resolve()
  loading ??= (async () => {
    let text: string | null = null
    const vaultRoot = root()
    if (vaultRoot !== null) {
      try {
        const bytes = await vaultFs.readBytes(vaultRoot, INSPIRATIONS_REL_PATH)
        text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
      } catch {
        // 文件还不存在：第一次进灵感页就是这种情况
      }
    }
    if (text === null && typeof window !== 'undefined') {
      text = localStorage.getItem(INSPIRATIONS_LS_KEY)
    }
    snapshot = parseInspirations(text)
    loaded = true
    emit()
  })()
  return loading
}

export function getInspirations(): Inspiration[] {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useInspirations(): Inspiration[] {
  return useSyncExternalStore(subscribe, getInspirations, getInspirations)
}

export async function createInspiration(): Promise<Inspiration> {
  await loadInspirations()
  const now = Date.now()
  const item: Inspiration = {
    id: newInspirationId(),
    title: '',
    content: EMPTY_INSPIRATION_CONTENT,
    createdAt: now,
    updatedAt: now,
  }
  await persist([item, ...snapshot])
  return item
}

export async function updateInspiration(
  id: string,
  draft: { title?: string; content?: string },
  options?: { silent?: boolean },
): Promise<void> {
  await loadInspirations()
  const current = snapshot.find((item) => item.id === id)
  if (current === undefined) throw new Error('这条灵感已被删除')
  const next: Inspiration = {
    ...current,
    title: draft.title ?? current.title,
    content: draft.content ?? current.content,
    updatedAt: Date.now(),
  }
  // 输入时不该每敲一个字就往上挪一位；`silent` 让自动保存只改内容不改排序。
  const items = options?.silent === true
    ? snapshot.map((item) => (item.id === id ? next : item))
    : [next, ...snapshot.filter((item) => item.id !== id)]
  await persist(items)
}

export async function deleteInspiration(id: string): Promise<void> {
  await loadInspirations()
  await persist(snapshot.filter((item) => item.id !== id))
}

/** 测试与「切库」时清掉内存快照 */
export function resetInspirations(): void {
  snapshot = []
  loaded = false
  loading = null
  emit()
}

export { normalizeInspirations }
