'use client'

/**
 * 条目页头的「和助手聊聊」。
 *
 * 只做三件事：先把当前条目存一下（没保存的正文不该被助手读到旧版）、
 * 把「聊谁」放进 `agent-bridge` 的待消费槽、切到助手工具页。
 * 真正的预填与开场白在 `AgentPlugin` 里 —— 它要等插件初始化完才拿得到会话库。
 *
 * 没开「读实体」权限时不渲染：助手看不到库，这个入口没有意义。
 */

import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { useNavigation } from '@/components/layout/NavigationContext'
import { toolItem } from '@/lib/entry-kinds'
import { usePlugins } from '@/lib/plugins'
import { AGENT_PLUGIN } from '@/lib/plugins/official'
import { requestAgentContext, type AgentContextKind } from '@/lib/plugins/agent-bridge'
import { ICON_BTN_MD } from '@/lib/ui-tokens'

export function TalkToAgentButton({
  kind,
  id,
  title,
  onBeforeOpen,
}: {
  kind: AgentContextKind
  id: number
  title: string
  /** 打开前先把当前编辑保存（各编辑器传 `form.handleSave` / `flushSave`） */
  onBeforeOpen?: () => void | Promise<void>
}) {
  const { setActiveItem } = useNavigation()
  const { plugins, enabled, granted } = usePlugins()
  const [busy, setBusy] = useState(false)

  const manifest = plugins.find((plugin) => plugin.id === AGENT_PLUGIN.id) ?? AGENT_PLUGIN
  const available = enabled(manifest) && granted(manifest).includes('read-entities')
  const clean = title.trim()

  if (!available || !clean) return null

  return (
    <button
      type="button"
      className={ICON_BTN_MD}
      title="和助手聊聊"
      aria-label="和助手聊聊"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void (async () => {
          try {
            await onBeforeOpen?.()
          } catch {
            // 保存失败就别跳走：留在编辑器里，错误提示已经由表单给出
            setBusy(false)
            return
          }
          requestAgentContext({ kind, id, title: clean })
          setActiveItem(toolItem(AGENT_PLUGIN.id))
          setBusy(false)
        })()
      }}
    >
      <MessageSquareText size={16} strokeWidth={2} />
    </button>
  )
}
