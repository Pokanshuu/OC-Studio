/**
 * Global settings: API parameters, agent policy, appearance.
 *
 * Persisted as one JSON blob in the `settings` table (not per-key rows) because
 * the whole shape is small and every write is a coalesced `save_settings` — the
 * same 400 ms debounce the Android app used for DataStore.
 *
 * Reading is defensive: an old blob merged over the defaults means a new field
 * never comes back `undefined` after an upgrade.
 */

import { create } from 'zustand'
import { cmd } from '@/plugins/agent/api/bridge'
import { PROVIDERS } from '@/plugins/agent/core/provider'
import { TOOL_NAMES } from '@/plugins/agent/core/agent/tools'
import { debounce } from '@/plugins/agent/core/util'
import type { Preset, Settings } from '@/plugins/agent/core/types'

export const DEFAULT_SETTINGS: Settings = {
  api: {
    provider: 'DEEPSEEK',
    baseUrl: PROVIDERS.DEEPSEEK.defaultBaseUrl,
    model: PROVIDERS.DEEPSEEK.defaultModel,
    thinking: 'high',
    temperature: 1,
    topP: 1,
    maxTokens: null,
  },
  agent: {
    workspace: null,
    maxSteps: 64,
    approval: 'ask',
    enabledTools: [...TOOL_NAMES],
    autoContinue: true,
  },
  ui: {
    theme: 'system',
    fontScale: 1,
    language: 'auto',
    autoCollapseThinking: true,
    showTokenRing: true,
    sendKey: 'enter',
    density: 'comfortable',
    lastConversationId: null,
  },
  systemPrompt: '',
  systemPrompts: { CREATIVE: '', ROLEPLAY: '', AGENT: '' },
  enabledPresets: [],
  autoTitle: true,
  compactKeepRecent: 6,
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-merge a stored blob over the defaults (arrays and scalars replace). */
export function mergeSettings(base: Settings, stored: unknown): Settings {
  if (!isObject(stored)) return base
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...target }
    for (const [key, value] of Object.entries(source)) {
      const current = target[key]
      if (isObject(value) && isObject(current)) {
        out[key] = merge(current, value)
      } else if (value !== undefined && value !== null) {
        out[key] = value
      }
    }
    return out
  }
  return merge(base as unknown as Record<string, unknown>, stored) as unknown as Settings
}

interface SettingsStore {
  settings: Settings
  loaded: boolean
  presets: Preset[]
  /** API key presence + masked hint (the key itself only lives in Rust). */
  keyHint: string
  hasKey: boolean

  load: () => Promise<void>
  patch: (updater: (current: Settings) => Settings) => void
  reset: () => void
  reloadPresets: () => Promise<void>
  savePreset: (id: string | null, name: string, content: string) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  refreshKeyHint: () => Promise<void>
}

const persist = debounce((value: string) => {
  void cmd.saveSettings(value).catch((error) => console.error('save_settings', error))
}, 400)

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  presets: [],
  keyHint: '',
  hasKey: false,

  load: async () => {
    try {
      const [raw, presets] = await Promise.all([cmd.getSettings(), cmd.listPresets()])
      let settings = DEFAULT_SETTINGS
      if (raw) {
        try {
          settings = mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw))
        } catch {
          settings = DEFAULT_SETTINGS
        }
      }
      set({ settings, presets, loaded: true })
      await get().refreshKeyHint()
    } catch (error) {
      console.error('settings load failed', error)
      set({ loaded: true })
    }
  },

  patch: (updater) => {
    const next = updater(get().settings)
    set({ settings: next })
    persist(JSON.stringify(next))
  },

  reset: () => {
    set({ settings: DEFAULT_SETTINGS })
    persist(JSON.stringify(DEFAULT_SETTINGS))
  },

  reloadPresets: async () => {
    set({ presets: await cmd.listPresets() })
  },

  savePreset: async (id, name, content) => {
    await cmd.savePreset(id, name, content, get().presets.length)
    await get().reloadPresets()
  },

  deletePreset: async (id) => {
    await cmd.deletePreset(id)
    await get().reloadPresets()
  },

  refreshKeyHint: async () => {
    try {
      const [hasKey, hint] = await cmd.apiKeyHint()
      set({ hasKey, keyHint: hint })
    } catch {
      set({ hasKey: false, keyHint: '' })
    }
  },
}))

/** Convenience: the settings object without subscribing to the whole store. */
export function currentSettings(): Settings {
  return useSettingsStore.getState().settings
}

/** Flush a pending debounced save immediately (called on window unload). */
export function flushSettings(): void {
  const settings = useSettingsStore.getState().settings
  persist(JSON.stringify(settings))
  persist.flush()
}
