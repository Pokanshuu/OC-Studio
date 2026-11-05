'use client'

/**
 * 插件开关与授权（插件级偏好，存 localStorage）。
 *
 * 为什么不进库：插件是**应用能力**，不是这个世界观的内容。换一个笔记库不该
 * 把「你装没装地图生成器」一起换掉（和主题 / 侧栏宽度同一档）。
 *
 * 状态用 `useSyncExternalStore` 订阅，与 `templates/store.ts` 同一套路：
 * 服务端渲染先给出厂值，客户端再读 localStorage，避免水合不一致。
 */
import { useSyncExternalStore } from 'react'
import { DEFAULT_GRANTED, type PluginManifest, type PluginPermission } from './types'
import { OFFICIAL_PLUGINS } from './official'

const LS_KEY = 'oc-plugins-v1'

interface PluginState {
  /** 显式关掉的内置插件（出厂是开的）或显式打开的（出厂是关的） */
  enabled: Record<string, boolean>
  /** 逐项授权；没写的项按 `DEFAULT_GRANTED` 兜底 */
  granted: Record<string, PluginPermission[]>
}

const EMPTY: PluginState = { enabled: {}, granted: {} }

let state: PluginState = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function read(): PluginState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<PluginState>
    return {
      enabled: parsed.enabled ?? {},
      granted: parsed.granted ?? {},
    }
  } catch {
    return EMPTY
  }
}

function write(next: PluginState): void {
  state = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      // 存不下就只在本次会话生效，不因为一个偏好把操作打断
    }
  }
  emit()
}

function ensureLoaded(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  state = read()
  emit()
}

function subscribe(listener: () => void): () => void {
  ensureLoaded()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isPluginEnabled(manifest: PluginManifest): boolean {
  return state.enabled[manifest.id] ?? manifest.enabledByDefault
}

/** 只有可用（非「开发中」）且已启用的插件才进界面 */
export function isPluginActive(manifest: PluginManifest): boolean {
  return manifest.available && isPluginEnabled(manifest)
}

export function grantedPermissions(manifest: PluginManifest): PluginPermission[] {
  const list = state.granted[manifest.id]
  if (list === undefined) return [...DEFAULT_GRANTED]
  return list
}

export function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return grantedPermissions(manifest).includes(permission)
}

export function setPluginEnabled(manifest: PluginManifest, enabled: boolean): void {
  write({ ...state, enabled: { ...state.enabled, [manifest.id]: enabled } })
}

export function setPermission(
  manifest: PluginManifest,
  permission: PluginPermission,
  granted: boolean,
): void {
  const current = new Set(grantedPermissions(manifest))
  if (granted) current.add(permission)
  else current.delete(permission)
  write({ ...state, granted: { ...state.granted, [manifest.id]: [...current] } })
}

/** 界面用：清单 + 每项的启用 / 授权状态（整体快照，避免逐项订阅） */
export function usePlugins(): {
  plugins: PluginManifest[]
  enabled: (manifest: PluginManifest) => boolean
  granted: (manifest: PluginManifest) => PluginPermission[]
} {
  // 订阅只为在开关变化时重渲染；真值从模块级 state 读，保证与服务端首屏同一份
  useSyncExternalStore(subscribe, () => state, () => EMPTY)
  return {
    plugins: [...OFFICIAL_PLUGINS],
    enabled: isPluginEnabled,
    granted: grantedPermissions,
  }
}
