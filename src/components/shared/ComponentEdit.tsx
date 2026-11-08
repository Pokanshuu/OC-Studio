'use client'

/**
 * 「编辑这个组件」的悬停入口。
 *
 * 只有**有组件库**的区块才给：基本信息（`InfoGroup`）与正文（`BodyGroup`）。
 * 按钮由区块自己的**标题行**渲染（没有标题行的正文由 `TemplateRenderer` 放在块右上角），
 * 点一下跳到 设置 › 世界 › 自定义组件 › 对应的组件。
 *
 * 当前模板是谁由 `TemplateRenderer` 通过 context 给 —— 这样信息区不用一层层接
 * `templateId` 的 props（四五个宿主各传一遍，早晚漏一个）。
 */
import { createContext, useContext, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import { componentEditTarget } from '@/lib/templates/edit-target'

const TemplateIdContext = createContext<string | null>(null)

export function ComponentEditProvider({ templateId, children }: { templateId: string; children: ReactNode }) {
  return <TemplateIdContext.Provider value={templateId}>{children}</TemplateIdContext.Provider>
}

/**
 * 悬停才显形的设置键。
 *
 * 父级行要带 `group`（行内一般是 `flex items-center justify-between`）；
 * 静止时 `opacity-0`，鼠标进到这一块或键盘聚焦时才出现 —— 写作面上不留常驻按钮。
 */
export function ComponentEditButton({
  componentId,
  className = '',
}: {
  componentId: 'info' | 'body'
  className?: string
}) {
  const templateId = useContext(TemplateIdContext)
  const { openSettings } = useSettingsTrigger()
  if (templateId === null) return null
  const edit = componentEditTarget(templateId, componentId)
  if (edit === null) return null

  return (
    <button
      type="button"
      onClick={() => openSettings('world', 'components', edit.target)}
      title={edit.label}
      aria-label={edit.label}
      tabIndex={-1}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 ${className}`}
    >
      <SlidersHorizontal size={13} strokeWidth={2} />
    </button>
  )
}
