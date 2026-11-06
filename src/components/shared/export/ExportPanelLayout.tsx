'use client'

/**
 * 导出面板的**外壳**：左预览 / 右配置 / 底部动作。
 *
 * 导出中心自己只是「页签 + 这个外壳」，四个面板各自只填三块内容；别的界面要
 * 埋一个导出面板（角色编辑器里直接给海报、小说里给文档预览）时，也套这一层，
 * 不必再抄一遍 320px 侧栏与滚动容器。
 *
 * 窄屏（≤767px）的上下分区由 `globals.css` 的 `.export-panel / .export-preview /
 * .export-config` 负责 —— 那三档必须是字面量类名，别在这里改成 `max-md:`。
 */
import type { ReactNode } from 'react'

export interface ExportPanelLayoutProps {
  /** 左：预览（可以是多个兄弟节点，用 Fragment 包） */
  preview: ReactNode
  /** 预览区的附加类（内边距 / 居中这类版式差异） */
  previewClassName?: string
  /** 右：配置分组（会自动装进可滚动的列里） */
  config: ReactNode
  /** 右下：尺寸提示 + 导出按钮 */
  footer: ReactNode
  className?: string
}

export function ExportPanelLayout({
  preview,
  previewClassName = '',
  config,
  footer,
  className = '',
}: ExportPanelLayoutProps) {
  return (
    <div className={`export-panel flex min-h-0 flex-1 ${className}`}>
      <div
        className={`export-preview relative flex min-h-0 min-w-0 flex-1 flex-col bg-paper-alt ${previewClassName}`}
      >
        {preview}
      </div>

      <aside className="export-config flex w-[320px] shrink-0 flex-col border-l border-line">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">{config}</div>
        <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">{footer}</div>
      </aside>
    </div>
  )
}
