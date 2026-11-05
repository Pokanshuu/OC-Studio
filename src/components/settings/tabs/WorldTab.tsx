'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useInputContextMenu } from '@/lib/use-input-context-menu'
import { useProjectMeta } from '@/features/project'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { TemplatesPanel } from '@/components/settings/TemplatesPanel'
import { CategoriesPanel } from '@/components/settings/CategoriesPanel'
import { ComponentsPanel } from '@/components/settings/ComponentsPanel'
import { TagsPanel } from '@/features/tags/components/TagsPanel'
import type { SettingsSection } from '@/components/layout/SettingsTriggerContext'
import { ICON_BTN } from '@/lib/ui-tokens'

type Panel = 'root' | SettingsSection

export function WorldTab({ open, section }: { open: boolean; section?: SettingsSection }) {
  const { meta, loading: metaLoading, save: saveMeta } = useProjectMeta()
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

          {/* 二级界面入口：字段表本身太长，收进下一级 */}
          <button
            type="button"
            onClick={() => setPanel('components')}
            className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
          >
            <span>自定义组件</span>
            <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
          </button>

          <button
            type="button"
            onClick={() => setPanel('templates')}
            className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
          >
            <span>模板</span>
            <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
          </button>

          <button
            type="button"
            onClick={() => setPanel('categories')}
            className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
          >
            <span>自定义分类</span>
            <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
          </button>

          <button
            type="button"
            onClick={() => setPanel('tags')}
            className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
          >
            <span>标签</span>
            <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
          </button>
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
          <ComponentsPanel />
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
          <TemplatesPanel />
        </div>
      )}
    </>
  )
}
