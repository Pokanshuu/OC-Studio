'use client'

import { useState, useEffect, useRef } from 'react'
import { useInputContextMenu } from '@/lib/use-input-context-menu'
import { useProjectMeta } from '@/features/project'
import { ImageUploader } from '@/components/shared/ImageUploader'
export function WorldTab({ open }: { open: boolean }) {
  const { meta, loading: metaLoading, save: saveMeta } = useProjectMeta()
  const worldNameRef = useInputContextMenu()
  const taglineRef = useInputContextMenu()

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
                    placeholder="给世界起个名吧"
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
                    placeholder="在这里输入简介"
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
              </div>

    </>
  )
}



