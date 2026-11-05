'use client'

/**
 * 助手插件的模型配置（OpenAI 兼容端点）。
 *
 * 存 localStorage：端点是**应用级偏好**，不是世界观内容（换库不该换模型）。
 * 形态照 Simple-Agent：baseURL + key + model 三个字段就够，不锁服务商。
 *
 * 安全口径：key 只留在本机浏览器 / WebView 的 localStorage 里，不进笔记库、
 * 不进 `.ocbak`、不上报。界面上只说这一句（约束 13 允许的「隐私安全」那类）。
 */
import { useCallback, useEffect, useState } from 'react'

const LS_KEY = 'oc-agent-provider-v1'

export interface AgentProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_PROVIDER: AgentProviderConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
}

export function isProviderReady(config: AgentProviderConfig): boolean {
  return config.baseUrl.trim() !== '' && config.model.trim() !== '' && config.apiKey.trim() !== ''
}

function read(): AgentProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_PROVIDER
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_PROVIDER
    const parsed = JSON.parse(raw) as Partial<AgentProviderConfig>
    return {
      baseUrl: parsed.baseUrl?.trim() || DEFAULT_PROVIDER.baseUrl,
      apiKey: parsed.apiKey ?? '',
      model: parsed.model?.trim() || DEFAULT_PROVIDER.model,
    }
  } catch {
    return DEFAULT_PROVIDER
  }
}

export function useAgentProvider(): {
  config: AgentProviderConfig
  save: (next: AgentProviderConfig) => void
  ready: boolean
} {
  const [config, setConfig] = useState<AgentProviderConfig>(DEFAULT_PROVIDER)

  // 首屏读本地配置（服务端渲染没有 localStorage，只能水合后补）
  useEffect(() => {
    setConfig(read())
  }, [])

  const save = useCallback((next: AgentProviderConfig) => {
    setConfig(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next))
      } catch {
        // 存不下就只在本次会话生效
      }
    }
  }, [])

  return { config, save, ready: isProviderReady(config) }
}
