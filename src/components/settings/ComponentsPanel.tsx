'use client'

/**
 * 设置 › 世界 › 自定义组件。
 *
 * 为什么不再叫「自定义表单字段」：字段表只是**一个组件**（基本信息）内部的排版，
 * 而模板里的组件各有各的可配置项 —— 正文的预设段落、关系的呈现方式、画廊的列数。
 * 这里按组件列入口，每个入口只负责自己的那份配置。
 *
 * 接上的三块：
 * - 基本信息 → **两级**：先选基本信息模板（角色 / 词条 / 宠物 / 武器 / 自建），
 *   点进去才是那一份字段表（`BasicInfoPanel`）
 * - 关系 / 画廊 → **两级**：先列接受这组参数的模板，点进去是那几个分段按钮
 *   （`TemplateParamPanel`）—— 参数的可编范围由 `lib/templates/params.ts` 决定
 * - 正文 → 两级：先列含正文的模板，点进去用**我们自己的编辑器**写预设段落
 *   （`BodyPresetPanel`；新建条目时铺进正文，见 `lib/templates/body-preset.ts`）
 */
import { useState } from 'react'
import { BasicInfoPanel } from '@/components/settings/BasicInfoPanel'
import { SettingsEntryRow } from '@/components/settings/EntryRow'
import { TemplateParamPanel } from '@/components/settings/TemplateParamPanel'
import { BodyPresetPanel } from '@/components/settings/BodyPresetPanel'
import type { TemplateComponentId } from '@/lib/templates/types'

type Panel = 'list' | 'info' | 'body' | 'relations' | 'gallery'

interface Row {
  key: Panel
  label: string
  /** 组件 id；没有配置面的行不填（当前没有这样的行，留字段给以后） */
  component?: TemplateComponentId
}

const ROWS: Row[] = [
  { key: 'info', label: '基本信息' },
  { key: 'body', label: '正文' },
  { key: 'relations', label: '关系', component: 'relations' },
  { key: 'gallery', label: '画廊', component: 'gallery' },
]

export function ComponentsPanel({ target }: { target?: string }) {
  const [panel, setPanel] = useState<Panel>(target ? 'info' : 'list')

  if (panel === 'info') {
    return <BasicInfoPanel onBack={() => setPanel('list')} initialId={target} />
  }
  if (panel === 'relations' || panel === 'gallery') {
    return <TemplateParamPanel componentId={panel} onBack={() => setPanel('list')} />
  }
  if (panel === 'body') {
    return <BodyPresetPanel onBack={() => setPanel('list')} />
  }

  return (
    <div className="flex flex-col">
      {ROWS.map((row) => (
        <SettingsEntryRow key={row.key} label={row.label} onClick={() => setPanel(row.key)} />
      ))}
    </div>
  )
}
