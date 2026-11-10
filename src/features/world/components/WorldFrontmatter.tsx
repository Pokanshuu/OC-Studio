'use client'

/**
 * 词条的标题输入 —— 模板「基本信息」区块里的那一行。
 *
 * 以前这里还带着标签 / 被引用的组合（`WorldMetaFields` / `WorldFrontmatter`），
 * 2026-11-11 起标签统一走 `components/shared/TagsSection`（与角色 / 事件 / 国家同一套），
 * 「被引用」只剩笔记宿主自己那一行（`NoteTemplateContent`），这里只留标题。
 */
import { TITLE_INPUT } from '@/lib/ui-tokens'

interface WorldTitleFieldProps {
  title: string
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** 占位文案：词条默认「词条标题」，分类条目可改成「名称」 */
  placeholder?: string
}

export function WorldTitleField({ title, onTitleChange, placeholder = '词条标题' }: WorldTitleFieldProps) {
  return (
    <input
      type="text"
      value={title}
      onChange={onTitleChange}
      placeholder={placeholder}
      className={`h-8 ${TITLE_INPUT}`}
    />
  )
}
