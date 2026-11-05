'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ChevronRight, LayoutTemplate, FolderTree, Tag, ListTree, Palette, Waypoints } from 'lucide-react'
import { useInputContextMenu } from '@/lib/use-input-context-menu'
import { useProjectMeta } from '@/features/project'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { TemplatesPanel } from '@/components/settings/TemplatesPanel'
import { CategoriesPanel } from '@/components/settings/CategoriesPanel'
import { ComponentsPanel } from '@/components/settings/ComponentsPanel'
import { TagsPanel } from '@/features/tags/components/TagsPanel'
import type { SettingsSection } from '@/components/layout/SettingsTriggerContext'
import { EdgeStyleRadio, MouseModeRadio } from '@/components/settings/controls'
import { ThemePanel } from '@/components/settings/ThemePanel'
import { useSettings } from '@/lib/settings'
import {
  ICON_BTN,
  SETTINGS_GROUP_FIRST,
  SETTINGS_LABEL,
  SETTINGS_ROW,
  SETTINGS_ROW_TOP,
} from '@/lib/ui-tokens'

type Panel = 'root' | SettingsSection

/**
 * 二级界面入口：图标 + 名称 + 箭头。
 *
 * 命名去掉了「自定义」前缀 —— 这四行的共同点是「世界怎么被组织起来」，
 * `自定义` 只是其中两个的实现细节。带前缀和不带前缀混排，读起来像两个层级的东西。
 * 图标只出现在**一级**的入口行上；进到二级页面以后标题就只是「返回 + 文字」，
 * 同一个东西不在两级各标一次。
 */
const ENTRY_ITEMS: ReadonlyArray<{
  panel: SettingsSection
  label: string
  icon: typeof ListTree
}> = [
  { panel: 'components', label: '字段组', icon: ListTree },
  { panel: 'templates', label: '模板', icon: LayoutTemplate },
  { panel: 'categories', label: '分类', icon: FolderTree },
  { panel: 'tags', label: '标签', icon: Tag },
  { panel: 'theme', label: '主题', icon: Palette },
  { panel: 'relations', label: '关系图操作', icon: Waypoints },
]

export function WorldTab({
  open,
  section,
  target,
}: {
  open: boolean
  section?: SettingsSection
  target?: string
}) {
  const { meta, loading: metaLoading, save: saveMeta } = useProjectMeta()
  const { settings, updateSetting } = useSettings()
  const worldNameRef = useInputContextMenu()
  const taglineRef = useInputContextMenu()
  /** 二级界面：自定义组件 / 模板 / 分类（都太长，不铺在一级页面上） */
  const [panel, setPanel] = useState<Panel>(section ?? 'root')

  const [worldName, setWorldName] = useState('')
  const [tagline, setTagline] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const touchedRef = useRef(false)
  useEffect(() => {
    if (!open || metaLoading || touchedRef.current) return
    setWorldName(meta.worldName)
    setTagline(meta.tagline)
    setCoverUrl(meta.coverUrl)
  }, [open, metaLoading, meta])

  // 关闭后重置「已编辑」标记，下次打开重新同步
  useEffect(() => {
    if (!open) touchedRef.current = false
  }, [open])

  return (
    <>
      {panel === 'root' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-ink">世界名称</label>
            <input
              ref={worldNameRef}
              type="text"
              value={worldName}
              onChange={(e) => {
                touchedRef.current = true
                setWorldName(e.target.value)
                void saveMeta({ worldName: e.target.value })
              }}
              placeholder="例：雾海纪元"
              className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-ink">简介</label>
            <input
              ref={taglineRef}
              type="text"
              value={tagline}
              onChange={(e) => {
                touchedRef.current = true
                setTagline(e.target.value)
                void saveMeta({ tagline: e.target.value })
              }}
              placeholder="例：被潮汐统治的群岛世界"
              className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
            />
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <span className="self-start text-sm text-ink">封面</span>
            <ImageUploader
              value={coverUrl}
              onChange={(path) => {
                touchedRef.current = true
                setCoverUrl(path)
                void saveMeta({ coverUrl: path })
              }}
              onRemove={() => {
                touchedRef.current = true
                setCoverUrl('')
                void saveMeta({ coverUrl: '' })
              }}
              aspectRatio="3:2"
              placeholderText="上传封面"
              size="lg"
            />
          </div>

          {/* 二级界面入口：四行同一套语法（图标 + 名称 + 箭头），命名不带「自定义」前缀 */}
          <div className="mt-2 flex flex-col border-t border-line">
            {ENTRY_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.panel}
                  type="button"
                  onClick={() => setPanel(item.panel)}
                  className="flex h-11 items-center gap-2.5 border-b border-line px-0.5 text-left text-[13px] text-ink transition-colors last:border-b-0 hover:text-ink-muted"
                >
                  <Icon size={15} strokeWidth={2} className="shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-ink-faint" />
                </button>
              )
            })}
          </div>
        </div>
      ) : panel === 'categories' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">自定义分类</span>
          </div>
          <CategoriesPanel />
        </div>
      ) : panel === 'components' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">自定义组件</span>
          </div>
          <ComponentsPanel target={target} />
        </div>
      ) : panel === 'tags' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">标签</span>
          </div>
          <TagsPanel />
        </div>
      ) : panel === 'theme' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">主题</span>
          </div>
          <ThemePanel />
        </div>
      ) : panel === 'relations' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">关系图操作</span>
          </div>
          <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-x-4">
            <span className="text-[13px] leading-5 text-ink">鼠标</span>
            <MouseModeRadio value={settings.mouseMode} onChange={(v) => updateSetting("mouseMode", v)} />
          </div>
          <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-x-4">
            <span className="text-[13px] leading-5 text-ink">连线</span>
            <EdgeStyleRadio value={settings.edgeStyle} onChange={(v) => updateSetting("edgeStyle", v)} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel('root')}
              aria-label="返回"
              className={ICON_BTN}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm text-ink">模板</span>
          </div>
          <TemplatesPanel initialId={target} />
        </div>
      )}
    </>
  )
}
