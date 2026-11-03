'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { TagPicker } from '@/features/tags'
import { Checkbox } from '@/components/ui/checkbox'
import { DATE_INPUT, FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, SECTION_TITLE } from '@/lib/ui-tokens'
import { useFieldConfig, type FieldDef } from '@/lib/fields'
import type { CharacterForm } from '../hooks/useCharacterForm'
import { BTN_QUIET } from '@/lib/ui-tokens'
import { resolveImageUrl } from '@/lib/image-service'
import { uploadAnimation } from '@/lib/video-upload'
import { toast } from 'sonner'

const TEXT_PLACEHOLDERS: Record<string, string> = {
  aliases: '多个用、分隔',
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

  const textValues: Record<string, { value: string; set: (v: string) => void }> = {
    aliases: { value: form.aliasesStr, set: form.setAliasesStr },
    race: { value: form.race, set: form.setRace },
    element: { value: form.element, set: form.setElement },
    occupation: { value: form.occupation, set: form.setOccupation },
    faction: { value: form.faction, set: form.setFaction },
    height: { value: form.height, set: form.setHeight },
  }

  const renderRow = (field: FieldDef) => {
    const wide = field.type === 'tags'
    const rowClass = wide
      ? `${FIELD_ROW_TOP}${compact ? '' : ' sm:col-span-2'}`
      : FIELD_ROW

    if (field.type === 'bool') {
      return (
        <label key={field.id} className={`${rowClass} cursor-pointer`}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <Checkbox
            checked={form.isMajor}
            onCheckedChange={(checked) => form.setIsMajor(checked === true)}
          />
        </label>
      )
    }

    if (field.type === 'tags') {
      return (
        <div key={field.id} className={rowClass}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="min-w-0 flex-1">
            <TagPicker selectedIds={form.tags} onChange={form.setTags} />
          </div>
        </div>
      )
    }

    if (field.type === 'country') {
      return (
        <div key={field.id} className={rowClass}>
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
        <div key={field.id} className={rowClass}>
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
        <div key={field.id} className={rowClass}>
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
      <div key={field.id} className={rowClass}>
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
    <section>
      <h3 className={SECTION_TITLE}>基本信息</h3>
      <div
        className={
          compact
            ? 'grid grid-cols-1 [&>*:last-child]:border-b-0'
            : `grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`
        }
      >
        {fields.map(renderRow)}

        {/* OC 动画：不属于字段表（它是媒体槽位，不是文本字段） */}
        <div className={`${FIELD_ROW_TOP} ${compact ? '' : 'sm:col-span-2'}`}>
          <span className={FIELD_LABEL}>动画</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {form.animationUrl ? (
              <>
                <video
                  src={resolveImageUrl(form.animationUrl, 'animation')}
                  className="h-12 w-20 rounded-item border border-line object-cover"
                  muted
                  playsInline
                />
                <button type="button" onClick={() => form.setAnimationUrl('')} className={BTN_QUIET}>
                  移除
                </button>
              </>
            ) : (
              <label className={`${BTN_QUIET} cursor-pointer`}>
                选择动画
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    void uploadAnimation(file)
                      .then((result) => {
                        form.setAnimationUrl(result.path)
                        if (result.ephemeral) {
                          toast('浏览器预览只能临时播放', { description: '桌面版会存进库的附件目录' })
                        }
                      })
                      .catch((err: unknown) => {
                        toast.error('上传失败', { description: err instanceof Error ? err.message : String(err) })
                      })
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
