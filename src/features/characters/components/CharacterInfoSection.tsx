'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Maximize2, Trash2, X } from 'lucide-react'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BTN_QUIET, DATE_INPUT, FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, ICON_BTN, SECTION_TITLE } from '@/lib/ui-tokens'
import { ComponentEditButton } from '@/components/shared/ComponentEdit'
import { useFieldConfig, type FieldDef } from '@/lib/fields'
import { resolveImageUrl } from '@/lib/image-service'
import { useMediaDownload } from '@/lib/use-media-download'
import { uploadAnimation } from '@/lib/video-upload'
import { toast } from 'sonner'
import type { CharacterForm } from '../hooks/useCharacterForm'

const TEXT_PLACEHOLDERS: Record<string, string> = {
  aliases: '多个用、分隔',
}

/**
 * 桌面看整段动画：与 `FullscreenViewer` 同一套深色遮罩，只是把 `<img>` 换成 `<video controls>`
 * （`FullscreenViewer` 的入参是图片 URL 数组，塞不进视频）。
 */
function AnimationLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[99999] flex items-center justify-center bg-black/80"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white/80 transition-colors hover:bg-white/30"
      >
        <X size={20} strokeWidth={2} />
      </button>
      <video src={src} controls autoPlay playsInline className="max-h-[90vh] max-w-[90vw] rounded-item" />
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}

/**
 * 基本信息 —— **按字段表渲染**。
 *
 * 行从哪来：`lib/fields` 的配置（设置 › 世界 › 角色基本信息 里增删改序）。
 * 值从哪来：内置字段读 `form` 里对应的列，自定义字段读 `form.custom[key]`。
 * 隐藏一行**不动数据** —— 表单 state 仍然全量加载、全量保存。
 */
export function CharacterInfoSection({
  form,
  onNavigateToCountry,
  compact = false,
}: {
  form: CharacterForm
  onNavigateToCountry?: (id: number) => void
  /** 三栏中栏的窄容器：字段单列（不依赖 viewport 的 sm 断点） */
  compact?: boolean
}) {
  const fields = useFieldConfig().character

  const [uploading, setUploading] = useState(false)
  /** 浏览器预览的 blob：只在这里播，**不写库**（刷新即死链） */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { save, saving } = useMediaDownload()

  const storedUrl = form.animationUrl ? resolveImageUrl(form.animationUrl, 'animation') : null
  const playableUrl = previewUrl ?? storedUrl

  async function handlePick(file: File | undefined) {
    if (file === undefined) return
    setUploading(true)
    try {
      const result = await uploadAnimation(file)
      if (result.ephemeral) {
        // 没有库可写：只在本地预览，刷新即失效，绝不写进表单
        setPreviewUrl(result.path)
        toast('浏览器预览，不会写进库')
      } else {
        setPreviewUrl(null)
        form.setAnimationUrl(result.path)
      }
    } catch (error) {
      // 超限 / 类型不对 / 没开库：`video-upload` 抛出的 message 已经是给用户看的一句话
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setUploading(false)
    }
  }

  const textValues: Record<string, { value: string; set: (v: string) => void }> = {
    aliases: { value: form.aliasesStr, set: form.setAliasesStr },
    race: { value: form.race, set: form.setRace },
    element: { value: form.element, set: form.setElement },
    occupation: { value: form.occupation, set: form.setOccupation },
    faction: { value: form.faction, set: form.setFaction },
    height: { value: form.height, set: form.setHeight },
  }

  const renderRow = (field: FieldDef) => {
    // 标签是独立区块（`docs/模板.md §6.4`），不再占基本信息的一行
    if (field.id === 'tags') return null

    if (field.type === 'bool') {
      return (
        <label key={field.id} className={`${FIELD_ROW} cursor-pointer`}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <Checkbox
            checked={form.isMajor}
            onCheckedChange={(checked) => form.setIsMajor(checked === true)}
          />
        </label>
      )
    }

    if (field.type === 'country') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="min-w-0 flex-1">
            {form.countries.length > 0 ? (
              <RelatedItemsSelector
                items={form.countryItems}
                selectedIds={form.selectedCountryIds}
                onChange={form.handleCountryChange}
                placeholder="搜索国家..."
                maxItems={1}
                onNavigateItem={onNavigateToCountry}
              />
            ) : (
              <input
                type="text"
                value={form.nationalityLegacy}
                onChange={(e) => form.setNationalityLegacy(e.target.value)}
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            )}
          </div>
        </div>
      )
    }

    // 生日与事件时间同一套：年 / 月 / 日 三段，整组共用一条底线。
    // 年份填了才会出现在时间线上（`出生` 节点）。
    if (field.id === 'birthday') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input value={form.birthdayYear} onChange={(e) => form.setBirthdayYear(e.target.value)} placeholder="年" className={DATE_INPUT} />
            <input value={form.birthdayMonth} onChange={(e) => form.setBirthdayMonth(e.target.value)} placeholder="月" className={DATE_INPUT} />
            <input value={form.birthdayDay} onChange={(e) => form.setBirthdayDay(e.target.value)} placeholder="日" className={DATE_INPUT} />
          </div>
        </div>
      )
    }

    const builtinInput = textValues[field.id]
    if (builtinInput === undefined) {
      // 自定义字段
      const key = field.key ?? field.id
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <input
            type="text"
            value={form.custom[key] ?? ''}
            onChange={(e) => form.setCustomValue(key, e.target.value)}
            className={FIELD_INPUT}
          />
        </div>
      )
    }

    return (
      <div key={field.id} className={FIELD_ROW}>
        <span className={FIELD_LABEL}>{field.label}</span>
        <input
          type="text"
          value={builtinInput.value}
          onChange={(e) => builtinInput.set(e.target.value)}
          placeholder={TEXT_PLACEHOLDERS[field.id] ?? ''}
          className={FIELD_INPUT}
        />
      </div>
    )
  }

  return (
    <section className="group">
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>基本信息</h3>
        <ComponentEditButton componentId="info" />
      </div>
      <div
        className={
          compact
            ? 'grid grid-cols-1 [&>*:last-child]:border-b-0'
            : `grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`
        }
      >
        {/* 类别已进字段表（`kind`），不再在这里硬编码 */}
        {fields.map(renderRow)}

        {/* OC 动画：不属于字段表（它是媒体槽位，不是文本字段） */}
        <div className={`${FIELD_ROW_TOP} ${compact ? '' : 'sm:col-span-2'}`}>
          <span className={FIELD_LABEL}>动画</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {playableUrl ? (
              <>
                <video
                  src={playableUrl}
                  controls
                  preload="metadata"
                  playsInline
                  className="aspect-video w-40 shrink-0 rounded-item border border-line bg-paper-card object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  className={`${ICON_BTN} max-md:hidden`}
                  aria-label="全屏播放"
                  title="全屏播放"
                >
                  <Maximize2 size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => void save(playableUrl, '动画.mp4')}
                  disabled={saving}
                  className={`${ICON_BTN} ${saving ? 'pointer-events-none opacity-50' : ''}`}
                  aria-label="保存到…"
                  title="保存到…"
                >
                  <Download size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className={ICON_BTN}
                  aria-label="移除动画"
                  title="移除动画"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </>
            ) : (
              <label className={`${BTN_QUIET} ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                {uploading ? '上传中…' : '选择动画'}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    // 清掉 input 的值：同一个文件重选也要触发 change
                    event.target.value = ''
                    void handlePick(file)
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {fullscreen && playableUrl ? (
        <AnimationLightbox src={playableUrl} onClose={() => setFullscreen(false)} />
      ) : null}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除动画</AlertDialogTitle>
            <AlertDialogDescription>只解除引用，文件仍在库里。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                form.setAnimationUrl('')
                setPreviewUrl(null)
              }}
            >
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
