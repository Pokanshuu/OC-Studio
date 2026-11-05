'use client'

/**
 * 设置 › 世界 › 自定义组件。
 *
 * 为什么不再叫「自定义表单字段」：字段表只是**一个组件**（基本信息）内部的排版，
 * 而模板里的组件各有各的可配置项 —— 正文的预设段落、关系的呈现方式、画廊的列数。
 * 这里按组件列入口，每个入口只负责自己的那份配置。
 *
 * 现阶段接上的只有：
 * - 基本信息 → **两级**：先选基本信息模板（角色 / 词条 / 宠物 / 武器 / 自建），
 *   点进去才是那一份字段表（`BasicInfoPanel`）
 * - 正文 / 关系 / 画廊 → 还没做，先显示「开发中」
 */
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { BasicInfoPanel } from '@/components/settings/BasicInfoPanel'

type Panel = 'list' | 'info'

const ROWS: { key: string; label: string; hint?: string }[] = [
  { key: 'info', label: '基本信息' },
  { key: 'body', label: '正文' },
  { key: 'relations', label: '关系' },
  { key: 'gallery', label: '画廊' },
]

export function ComponentsPanel() {
  const [panel, setPanel] = useState<Panel>('list')

  if (panel === 'info') {
    return <BasicInfoPanel onBack={() => setPanel('list')} />
  }

  return (
    <div className="flex flex-col">
      {ROWS.map((row) => {
        const enabled = row.key === 'info'
        return (
          <button
            key={row.key}
            type="button"
            disabled={!enabled}
            onClick={() => setPanel('info')}
            className="flex items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            <span>{row.label}</span>
            {enabled ? (
              <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
            ) : (
              <span className="text-[11px] text-ink-faint">开发中</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
