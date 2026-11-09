'use client'

/**
 * 「这篇用哪个模板」—— 词条与分类条目共用的一个入口。
 *
 * 存的是 `WorldEntry.template`（模板**名字**，frontmatter 里可读）；空 = 跟随分类 / 默认。
 * 候选只有笔记型模板，角色 / 事件 / 国家三个实体模板不在列（见 `lib/templates/note.ts`
 * 的 `perNoteTemplates`）—— 摆到笔记上只会渲染出一堆空行。
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { useTemplates } from '@/lib/templates/store'
import { perNoteTemplates } from '@/lib/templates/note'
import type { TemplateDoc } from '@/lib/templates/types'
import { BTN_QUIET } from '@/lib/ui-tokens'

export function NoteTemplateButton({
  template,
  /** 「跟随分类（国家）」/「默认模板」—— 第一项，用来清掉单篇覆盖 */
  followLabel,
  onSelect,
}: {
  /** 当前生效的模板（含分类回落），只用于按钮上的名字 */
  template: TemplateDoc | undefined
  followLabel: string
  /** 传 `''` = 跟随分类 / 默认 */
  onSelect: (name: string) => void
}) {
  const { templates } = useTemplates()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const candidates = perNoteTemplates(templates)

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: Math.max(8, rect.right - 180), y: rect.bottom + 4 })
        }}
        className={BTN_QUIET}
        title="这篇用哪个模板"
      >
        模板 · {template?.name ?? '词条'}
        <ChevronDown size={12} strokeWidth={2} className="text-ink-faint" />
      </button>
      {menu ? (
        <MediaContextMenu
          at={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: followLabel, onSelect: () => onSelect('') },
            ...candidates.map((doc) => ({
              label: doc.id === template?.id ? `${doc.name}（当前）` : doc.name,
              onSelect: () => onSelect(doc.name),
            })),
          ]}
        />
      ) : null}
    </>
  )
}
