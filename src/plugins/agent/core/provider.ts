/**
 * Providers and model capabilities.
 *
 * One adapter only: the OpenAI-compatible `/chat/completions` protocol. Providers
 * differ by base URL, default model and (sometimes) required headers.
 */

import type { ProviderKind } from './types'

export type { ProviderKind } from './types'

export interface ModelInfo {
  id: string
  displayName: string
  supportsVision: boolean
  supportsThinking: boolean
  /** Context window, used by the usage ring and the compaction threshold. */
  contextWindow: number
}

export interface ProviderMeta {
  id: ProviderKind
  label: string
  defaultBaseUrl: string
  defaultModel: string
  /** OpenCode Go serves `/models` without auth. */
  modelListNeedsAuth: boolean
  /** Shown in settings so users know what the endpoint expects. */
  hint: string
}

export const DEFAULT_CONTEXT_WINDOW = 128_000

export const PROVIDERS: Record<ProviderKind, ProviderMeta> = {
  DEEPSEEK: {
    id: 'DEEPSEEK',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    modelListNeedsAuth: true,
    hint: 'api.deepseek.com',
  },
  OPENCODE_GO: {
    id: 'OPENCODE_GO',
    label: 'OpenCode Go',
    defaultBaseUrl: 'https://opencode.ai/zen/go/v1',
    defaultModel: 'deepseek-v4-flash',
    modelListNeedsAuth: false,
    hint: 'opencode.ai/zen/go/v1',
  },
  CUSTOM: {
    id: 'CUSTOM',
    label: '自定义',
    defaultBaseUrl: '',
    defaultModel: '',
    modelListNeedsAuth: true,
    hint: '任意 OpenAI 兼容端点',
  },
}

function model(
  id: string,
  displayName: string,
  contextWindow: number,
  supportsVision = false,
  supportsThinking = false,
): ModelInfo {
  return { id, displayName, supportsVision, supportsThinking, contextWindow }
}

const DEEPSEEK_MODELS: ModelInfo[] = [
  model('deepseek-flash', 'DeepSeek V4.1 Flash', 1_000_000, true, true),
  model('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000, false, true),
]

/**
 * OpenCode Go catalogue. Unlisted models fall back to conservative defaults and
 * can be overridden in settings.
 */
const OPENCODE_MODELS: ModelInfo[] = [
  model('deepseek-v4-flash', 'DeepSeek V4 Flash', 1_000_000, false, true),
  model('deepseek-flash', 'DeepSeek Flash', 1_000_000, false, true),
  model('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 1_000_000, false, true),
  model('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000, false, true),
  model('deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision (exp)', 1_000_000, true, true),
  model('kimi-k3', 'Kimi K3', 262_144, true),
  model('kimi-k2.7-code', 'Kimi K2.7 Code', 262_144, true),
  model('kimi-k2.6', 'Kimi K2.6', 262_144, true),
  model('kimi-k2.5', 'Kimi K2.5', 262_144, true),
  model('glm-5.3', 'GLM-5.3', 202_752),
  model('glm-5.3-flash', 'GLM-5.3 Flash', 202_752),
  model('glm-5.2', 'GLM-5.2', 1_000_000),
  model('glm-5.1', 'GLM-5.1', 202_752),
  model('glm-5', 'GLM-5', 202_752),
  model('mimo-v2.5', 'MiMo V2.5', 1_000_000, true),
  model('mimo-v2.5-pro', 'MiMo V2.5 Pro', 1_048_576),
  model('mimo-v2-pro', 'MiMo V2 Pro', 1_000_000, true),
  model('mimo-v2-omni', 'MiMo V2 Omni', 1_000_000, true),
  model('qwen3.8-max', 'Qwen3.8 Max', 1_000_000),
  model('qwen3.7-max', 'Qwen3.7 Max', 1_000_000),
  model('qwen3.7-plus', 'Qwen3.7 Plus', 1_000_000, true),
  model('qwen3.6-plus', 'Qwen3.6 Plus', 262_144, true),
  model('qwen3.5-plus', 'Qwen3.5 Plus', 262_144, true),
  model('grok-4.6', 'Grok 4.6', 256_000, true),
  model('grok-4.5', 'Grok 4.5', 256_000, true),
  model('minimax-m3', 'MiniMax M3', 204_800),
  model('minimax-m2.7', 'MiniMax M2.7', 204_800),
  model('minimax-m2.5', 'MiniMax M2.5', 204_800),
  model('hy4-preview', 'HY4 Preview', 262_144),
  model('hy3', 'HY3', 262_144),
  model('hy3-preview', 'HY3 Preview', 262_144),
  model('longcat-2.0', 'LongCat 2.0', 262_144),
]

export function knownModels(kind: ProviderKind): ModelInfo[] {
  if (kind === 'DEEPSEEK') return DEEPSEEK_MODELS
  if (kind === 'OPENCODE_GO') return OPENCODE_MODELS
  return []
}

export function findModel(kind: ProviderKind, modelId: string): ModelInfo {
  const known = knownModels(kind).find((m) => m.id === modelId)
  if (known) return known
  return {
    id: modelId,
    displayName: modelId,
    supportsVision: false,
    supportsThinking: false,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
  }
}

/** Merge a live `/models` list with the capability table (unknown = defaults). */
export function mergeModels(kind: ProviderKind, remoteIds: string[]): ModelInfo[] {
  if (remoteIds.length === 0) return knownModels(kind)
  const known = new Map(knownModels(kind).map((m) => [m.id, m]))
  return remoteIds.map(
    (id) =>
      known.get(id) ?? {
        id,
        displayName: id,
        supportsVision: false,
        supportsThinking: false,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
      },
  )
}

/**
 * OpenCode Go requires `x-opencode-session`, otherwise it answers 400
 * `MissingSessionID` (the header is used for routing). A stable per-install id is
 * enough; it must not change per request.
 */
export function headersFor(kind: ProviderKind, sessionId: string): Record<string, string> {
  return kind === 'OPENCODE_GO' ? { 'x-opencode-session': sessionId } : {}
}

/** Build `/chat/completions`, tolerating a trailing slash or a full path. */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

export function modelsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return base.endsWith('/models') ? base : `${base}/models`
}

/** Some endpoints people paste in include the version segment already. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}
