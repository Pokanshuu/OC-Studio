'use client'

/**
 * 模板的读写 —— **库里有文件就认文件，没有就用内置定义**。
 *
 * 存储位置：`.ocstudio/templates/<id>.md`（随库走、可分享，见 `docs/模板.md §3.2`）。
 * 浏览器 / Mock 预览没有真实文件夹，退化成 localStorage（键 `oc-templates-v1`），
 * 这条退化只为了让「设置里点得动」，不参与任何导出。
 *
 * 状态用 `useSyncExternalStore` 订阅，与 `vault-provider` 同一套路：
 * 服务端渲染时先给内置模板，客户端再补上磁盘里的。
 */
import { useEffect, useState } from 'react'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { setTemplateCustomFieldKeys } from '@/lib/vault/vault-field-keys'
import { BUILTIN_TEMPLATES } from './defaults'
import { collectTemplateFieldKeys } from './fields'
import { parseTemplate, serializeTemplate } from './serialize'
import { TEMPLATE_DIR, templatePath, type TemplateDoc } from './types'

const LS_KEY = 'oc-templates-v1'

let cache: TemplateDoc[] = BUILTIN_TEMPLATES.map((doc) => JSON.parse(JSON.stringify(doc)) as TemplateDoc)
let loaded = false
let loading: Promise<void> | null = null
let error: string | null = null
const listeners = new Set<() => void>()
function emit(): void {
  for (const listener of listeners) listener()
}

/** 模板字段键登记给 scan / serialize（宠物 / 武器 → 物种 / 材质…） */
function syncFieldKeys(): void {
  setTemplateCustomFieldKeys({ worldEntry: collectTemplateFieldKeys(cache) })
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

async function readFromVault(root: string): Promise<TemplateDoc[] | null> {
  try {
    const assets = await vaultFs.listAssets(root, TEMPLATE_DIR)
    const files = assets.filter((asset) => asset.name.toLowerCase().endsWith('.md'))
    if (files.length === 0) return null
    const out: TemplateDoc[] = []
    for (const file of files) {
      const bytes = await vaultFs.readBytes(root, file.relPath)
      const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
      const fallbackId = file.name.replace(/\.md$/i, '')
      const parsed = parseTemplate(text, fallbackId)
      if (parsed) out.push(parsed)
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function readFromStorage(): TemplateDoc[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const docs = parsed.filter((item): item is TemplateDoc => {
      return Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item && 'components' in item)
    })
    return docs.length > 0 ? docs : null
  } catch {
    return null
  }
}

/**
 * 盘上的模板 + 内置模板合并：同 id 以盘上为准，内置的缺失项补在后。
 * 这样「库里只有一个自定义模板」时，角色 / 事件等内置项仍然可用。
 */
function merge(docs: TemplateDoc[] | null): TemplateDoc[] {
  const byId = new Map<string, TemplateDoc>()
  for (const builtin of BUILTIN_TEMPLATES) {
    byId.set(builtin.id, JSON.parse(JSON.stringify(builtin)) as TemplateDoc)
  }
  for (const doc of docs ?? []) byId.set(doc.id, doc)
  return [...byId.values()]
}

// 内置模板已经声明了宠物 / 武器的字段；即使还没读盘也先登记
syncFieldKeys()

export function getTemplates(): TemplateDoc[] {
  return cache
}
export function subscribeTemplates(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function loadTemplates(force = false): Promise<void> {
  if (loading) return loading
  if (loaded && !force) return
  loading = (async () => {
    error = null
    try {
      const root = vaultRoot()
      const fromDisk = root ? await readFromVault(root) : null
      cache = merge(fromDisk ?? readFromStorage())
      syncFieldKeys()
      loaded = true
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = null
      emit()
    }
  })()
  return loading
}

/** 整体保存（编排界面改完就调）：写盘 + 更新缓存 */
export async function saveTemplates(docs: TemplateDoc[]): Promise<void> {
  cache = docs.map((doc) => ({ ...doc }))
  syncFieldKeys()
  const root = vaultRoot()
  if (root) {
    const entries = docs.map((doc) => ({ relPath: templatePath(doc.id), content: serializeTemplate(doc) }))
    const results = await vaultFs.writeTexts(root, entries)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      throw new Error(failed[0].error ?? '模板写入失败')
    }
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(docs))
  }
  loaded = true
  emit()
}

/** 只改一条：读缓存 → 原位替换 → 整体写回（写回是「外科式」的，别的模板不动） */
export async function saveTemplate(next: TemplateDoc): Promise<void> {
  const exists = cache.some((doc) => doc.id === next.id)
  const docs = exists ? cache.map((doc) => (doc.id === next.id ? next : doc)) : [...cache, next]
  await saveTemplates(docs)
}

export function resetTemplateToBuiltin(id: string): TemplateDoc | null {
  const builtin = BUILTIN_TEMPLATES.find((doc) => doc.id === id)
  return builtin ? (JSON.parse(JSON.stringify(builtin)) as TemplateDoc) : null
}

/** 按名字找模板（笔记里的 `模板:` 存的是名字，旧名走 `aliases`） */
export function findTemplateByName(name: string): TemplateDoc | undefined {
  const target = name.trim()
  if (!target) return undefined
  return (
    cache.find((doc) => doc.name === target) ??
    cache.find((doc) => doc.aliases.includes(target)) ??
    cache.find((doc) => doc.id === target)
  )
}

/** React 侧读模板：先给缓存，装载完成后再刷新一次 */
export function useTemplates(): { templates: TemplateDoc[]; loading: boolean; error: string | null } {
  const [snapshot, setSnapshot] = useState<TemplateDoc[]>(() => cache)
  const [pending, setPending] = useState(!loaded)

  useEffect(() => {
    const unsubscribe = subscribeTemplates(() => {
      setSnapshot([...cache])
      setPending(!loaded)
    })
    void loadTemplates()
    return unsubscribe
  }, [])

  return { templates: snapshot, loading: pending, error }
}
