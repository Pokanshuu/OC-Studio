'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useInputContextMenu } from '@/lib/use-input-context-menu'
import { useProjectMeta } from '@/features/project'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { FieldSettings } from '@/components/settings/FieldSettings'
import { ICON_BTN } from '@/lib/ui-tokens'

export function WorldTab({ open }: { open: boolean }) {
  const { meta, loading: metaLoading, save: saveMeta } = useProjectMeta()
  const worldNameRef = useInputContextMenu()
  const taglineRef = useInputContextMenu()
  /** 二级界面：自定义表单字段（字段表太长，不铺在一级页面上） */
  const [panel, setPanel] = useState<'root' | 'fields'>('root')

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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink">封面</span>
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
            onClick={() => setPanel('fields')}
            className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
          >
            <span>自定义表单字段</span>
            <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
          </button>
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
            <span className="text-sm text-ink">自定义表单字段</span>
          </div>
          <FieldSettings />
        </div>
      )}
    </>
  )
}
