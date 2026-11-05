/**
 * 助手的流式对话客户端（OpenAI 兼容 `/chat/completions`）。
 *
 * 为什么自己写而不用 SDK：只有一条协议、三种事件，引一个 SDK 要多几十 MB 和
 * 一套它自己的错误类型；这里要的只是「读到一行 data、切出 delta」。
 *
 * 口径：
 * - 只发 `messages`，不做工具注入（工具循环下一步接 `lib/capabilities`，见 `docs/插件.md` §0.2）
 * - 增量通过回调推出去，**不走 React state**（每个 token 一次 setState 会把输入框拖死）
 * - `signal` 取消：切换对话 / 关面板时立刻断流，不留悬挂连接
 */
import type { AgentProviderConfig } from './config'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChatOptions {
  config: AgentProviderConfig
  messages: readonly AgentMessage[]
  /** 收到一段增量文本 */
  onDelta: (chunk: string) => void
  signal?: AbortSignal
}

function endpointOf(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  // 允许用户直接填 `…/chat/completions`，也允许只填到 `/v1`
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

/** 从一行 `data: {...}` 里取增量；不是增量行就返回空串 */
function deltaOf(payload: string): string {
  if (payload === '[DONE]') return ''
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>
    }
    return parsed.choices?.[0]?.delta?.content ?? ''
  } catch {
    // 有的兼容端点会先发心跳 / 注释行，解析失败就当没有
    return ''
  }
}

export async function streamChat({ config, messages, onDelta, signal }: StreamChatOptions): Promise<void> {
  const response = await fetch(endpointOf(config.baseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`请求失败（${response.status}）${text.slice(0, 120)}`)
  }
  if (!response.body) throw new Error('这个端点没有返回流')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分隔事件；只处理完整的那些，剩下的留到下一轮
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const event = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      for (const line of event.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const chunk = deltaOf(trimmed.slice(5).trim())
        if (chunk !== '') onDelta(chunk)
      }
      index = buffer.indexOf('\n\n')
    }
  }
}
