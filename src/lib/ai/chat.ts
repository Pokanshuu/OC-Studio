import type { Settings } from '@/lib/settings'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionOptions {
  model: string
  baseUrl: string
  apiKey: string
  maxTokens?: number
  temperature?: number
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions,
): Promise<string> {
  const { model, baseUrl, apiKey, maxTokens = 1024, temperature = 0.7 } = options

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      thinking: { type: 'disabled' },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`AI 请求失败 (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export function getAIConfig(settings: Settings): { available: boolean } & Partial<ChatCompletionOptions> {
  const apiKey = settings.apiKey.trim()
  const baseUrl = settings.aiBaseUrl.trim() || 'https://api.openai.com/v1'
  const model = settings.aiModel.trim() || 'gpt-4o'

  return {
    available: !!apiKey,
    apiKey,
    baseUrl,
    model,
  }
}
